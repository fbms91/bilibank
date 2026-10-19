-- Bilibank: estrutura do banco no Supabase. Rodar uma vez no SQL Editor do projeto.
-- Um documento por caminho, igual ao painel no Claude: config/base, fixas/<id>, lanc/<id>.
-- Cada pessoa só lê e grava os próprios documentos (RLS pelo usuário logado).

create table if not exists public.docs (
  owner      uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  path       text        not null check (path ~ '^[^/]+(/[^/]+)+$'),
  data       jsonb       not null,
  updated_at timestamptz not null default now(),
  primary key (owner, path)
);

alter table public.docs enable row level security;

drop policy if exists "docs: ler os meus"   on public.docs;
drop policy if exists "docs: criar os meus" on public.docs;
drop policy if exists "docs: mudar os meus" on public.docs;
drop policy if exists "docs: apagar os meus" on public.docs;

create policy "docs: ler os meus"    on public.docs for select to authenticated using (owner = (select auth.uid()));
create policy "docs: criar os meus"  on public.docs for insert to authenticated with check (owner = (select auth.uid()));
create policy "docs: mudar os meus"  on public.docs for update to authenticated using (owner = (select auth.uid())) with check (owner = (select auth.uid()));
create policy "docs: apagar os meus" on public.docs for delete to authenticated using (owner = (select auth.uid()));

-- quem não está logado não toca na tabela
revoke all on public.docs from anon;
grant select, insert, update, delete on public.docs to authenticated;

create or replace function public.docs_tocar() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists docs_tocar on public.docs;
create trigger docs_tocar before update on public.docs for each row execute function public.docs_tocar();

-- tempo real: o app no celular e no computador se atualizam sozinhos quando um deles grava
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'docs') then
    alter publication supabase_realtime add table public.docs;
  end if;
end $$;
