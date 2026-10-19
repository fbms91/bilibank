/* Gera o SQL que copia os dados do painel no Claude para o Supabase.
   Entrada: uma pasta com um .json por documento (config/base.json, fixas/agua.json, lanc/<id>.json),
   exportada do banco do painel pelo Claude logo antes da troca.
   Saída: um .sql para colar no SQL Editor do Supabase DEPOIS de criar o acesso do Filipe.
   O arquivo gerado tem os dados financeiros: não vai para o GitHub nem para a pasta public.
   Rodar: node scripts/gerar-migracao.mjs <pasta-exportada> <saida.sql> */
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

const [pasta, saida] = process.argv.slice(2);
if (!pasta || !saida) {
  console.error("Uso: node scripts/gerar-migracao.mjs <pasta-exportada> <saida.sql>");
  process.exit(1);
}

function listar(dir) {
  return readdirSync(dir).flatMap((n) => {
    const p = path.join(dir, n);
    return statSync(p).isDirectory() ? listar(p) : n.endsWith(".json") ? [p] : [];
  });
}

const docs = listar(pasta)
  .map((arq) => ({ path: path.relative(pasta, arq).replace(/\\/g, "/").replace(/\.json$/, ""), data: JSON.parse(readFileSync(arq, "utf8")) }))
  .sort((a, b) => a.path.localeCompare(b.path));

for (const d of docs) {
  if (!/^[^/]+(\/[^/]+)+$/.test(d.path)) throw new Error("Caminho inválido: " + d.path);
  if (d.data === null || typeof d.data !== "object" || Array.isArray(d.data)) throw new Error("Documento não é um objeto: " + d.path);
}
if (!docs.some((d) => d.path === "config/base")) throw new Error("Falta config/base na pasta exportada.");

const q = (s) => "'" + String(s).replace(/'/g, "''") + "'";
const linhas = docs.map((d) => `    (dono, ${q(d.path)}, ${q(JSON.stringify(d.data))}::jsonb)`);
const conta = (pre) => docs.filter((d) => d.path.startsWith(pre + "/")).length;

const sql = `-- Bilibank: dados do painel no Claude copiados para o Supabase.
-- Gerado em ${new Date().toISOString()} com ${docs.length} documentos (config ${conta("config")}, fixas ${conta("fixas")}, lanc ${conta("lanc")}).
-- Rodar no SQL Editor DEPOIS de 01-esquema.sql e de criar o acesso do Filipe (deve existir um único usuário).
-- Pode rodar de novo: o mesmo caminho é atualizado, nada é duplicado.
do $$
declare
  dono uuid;
begin
  if (select count(*) from auth.users) <> 1 then
    raise exception 'Esperava exatamente 1 usuário em Authentication > Users. Crie só o acesso do Filipe antes de rodar.';
  end if;
  select id into dono from auth.users;

  insert into public.docs (owner, path, data) values
${linhas.join(",\n")}
  on conflict (owner, path) do update set data = excluded.data;

  raise notice 'Bilibank: % documentos gravados.', ${docs.length};
end $$;

select split_part(path, '/', 1) as colecao, count(*) as documentos from public.docs group by 1 order by 1;
`;
writeFileSync(saida, sql);
console.log(`${saida}: ${docs.length} documentos (config ${conta("config")}, fixas ${conta("fixas")}, lanc ${conta("lanc")})`);
