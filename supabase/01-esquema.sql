-- Bilibank: estrutura do banco no Supabase. Rodar uma vez no SQL Editor do projeto.
-- Um documento por caminho, igual ao painel no Claude: config/base, fixas/<id>, lanc/<id>.
-- Cada pessoa só lê e grava os próprios documentos (RLS pelo usuário logado).
-- O Bilibank tem um único acesso: depois do primeiro, ninguém mais consegue se cadastrar.

create table if not exists public.docs (
  owner      uuid        not null default auth.uid() references auth.users (id),  -- sem cascade: apagar o acesso nunca apaga os dados
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

-- um único acesso: o primeiro cadastro passa, qualquer outro é recusado pelo próprio banco
create or replace function public.bilibank_um_acesso() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from auth.users) then
    raise exception 'O Bilibank aceita um único acesso.';
  end if;
  return new;
end $$;

revoke execute on function public.bilibank_um_acesso() from public, anon, authenticated;

drop trigger if exists bilibank_um_acesso on auth.users;
create trigger bilibank_um_acesso before insert on auth.users for each row execute function public.bilibank_um_acesso();

-- dados à espera do primeiro acesso: o Claude carrega aqui antes, e o primeiro login adota tudo
create table if not exists public.docs_import (
  path text  primary key check (path ~ '^[^/]+(/[^/]+)+$'),
  data jsonb not null
);
alter table public.docs_import enable row level security;  -- sem regras: o app não lê nem grava aqui
revoke all on public.docs_import from anon, authenticated;

create or replace function public.bilibank_adotar() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.docs (owner, path, data)
    select new.id, path, data from public.docs_import
    on conflict (owner, path) do update set data = excluded.data;
  delete from public.docs_import where true;
  return new;
end $$;

revoke execute on function public.bilibank_adotar() from public, anon, authenticated;

drop trigger if exists bilibank_adotar on auth.users;
create trigger bilibank_adotar after insert on auth.users for each row execute function public.bilibank_adotar();
