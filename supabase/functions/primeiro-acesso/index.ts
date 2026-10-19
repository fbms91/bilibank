/* Primeiro acesso do Bilibank: cria o login do Filipe já confirmado, sem e-mail de confirmação.
   Só funciona enquanto não existe nenhum acesso; depois disso responde sempre "já criado"
   (e o banco também recusa qualquer cadastro novo, ver supabase/01-esquema.sql).
   A chave de administrador é a que o Supabase entrega às funções; nunca sai daqui. */
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const resposta = (status, corpo) => new Response(JSON.stringify(corpo), { status, headers: { ...cors, "Content-Type": "application/json" } });

function chaveAdmin() {
  const antiga = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (antiga) return antiga;
  const novas = Deno.env.get("SUPABASE_SECRET_KEYS") || "";
  try { const o = JSON.parse(novas); return typeof o === "string" ? o : Object.values(o)[0]; } catch { return novas; }
}
/* chaves novas (sb_secret_...) vão só no apikey; a antiga (JWT) vai nos dois */
const cabecalhos = (k) => (k.startsWith("sb_") ? { apikey: k } : { apikey: k, Authorization: `Bearer ${k}` });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return resposta(405, { code: "metodo", message: "Use POST." });

  const { email, senha } = await req.json().catch(() => ({}));
  if (typeof email !== "string" || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) return resposta(400, { code: "email", message: "Confira o e-mail." });
  if (typeof senha !== "string" || senha.length < 8) return resposta(400, { code: "senha", message: "Use uma senha de pelo menos 8 caracteres." });

  const base = Deno.env.get("SUPABASE_URL"), chave = chaveAdmin();
  if (!base || !chave) return resposta(500, { code: "config", message: "A função está sem a configuração do Supabase." });
  const h = cabecalhos(chave);

  const lista = await fetch(`${base}/auth/v1/admin/users?page=1&per_page=1`, { headers: h });
  if (!lista.ok) return resposta(500, { code: "erro", message: "Não consegui conferir os acessos." });
  const { users = [] } = await lista.json();
  if (users.length) return resposta(403, { code: "fechado", message: "Seu acesso já existe. Toque em Entrar." });

  const novo = await fetch(`${base}/auth/v1/admin/users`, {
    method: "POST",
    headers: { ...h, "Content-Type": "application/json" },
    body: JSON.stringify({ email: email.trim().toLowerCase(), password: senha, email_confirm: true }),
  });
  if (!novo.ok) {
    const e = await novo.json().catch(() => ({}));
    return resposta(novo.status === 422 ? 400 : 500, { code: "erro", message: e.msg || e.message || "Não consegui criar o acesso." });
  }
  return resposta(200, { ok: true });
});
