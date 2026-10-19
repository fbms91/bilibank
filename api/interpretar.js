/* Interpreta o que o Filipe fala ou escreve no Lançar, pela API do Claude.
   A chave fica só aqui no servidor (variável ANTHROPIC_API_KEY no Vercel), nunca no celular.
   Só atende quem está logado no app: o token do Supabase é conferido antes de chamar o Claude. */
import Anthropic from "@anthropic-ai/sdk";

// sem a chave o módulo ainda carrega, para o app mostrar o que falta em vez de um erro genérico
const client = process.env.ANTHROPIC_API_KEY ? new Anthropic() : null;

async function usuario(req) {
  const token = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!token || !process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) return null;
  const r = await fetch(`${process.env.SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: process.env.SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` },
  });
  if (!r.ok) return null;
  const u = await r.json();
  const permitido = (process.env.EMAIL_PERMITIDO || "").trim().toLowerCase();
  if (permitido && String(u.email || "").toLowerCase() !== permitido) return null;
  return u;
}

/* o painel pede "responda só com JSON"; aceita também o JSON dentro de ```json ... ``` */
function lerJson(texto) {
  const i = texto.indexOf("{"), j = texto.lastIndexOf("}");
  if (i < 0 || j < i) throw new Error("A resposta não veio em JSON.");
  return JSON.parse(texto.slice(i, j + 1));
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ code: "metodo", message: "Use POST." });
  if (!(await usuario(req))) return res.status(401).json({ code: "not_granted", message: "Entre no app de novo." });
  if (!client) return res.status(500).json({ code: "chave", message: "Falta a chave da API do Claude no Vercel (ANTHROPIC_API_KEY)." });

  const { input, json = true } = req.body || {};
  const messages = typeof input === "string" ? (input.trim() ? [{ role: "user", content: input }] : null) : Array.isArray(input) ? input : null;
  if (!messages || !messages.length || JSON.stringify(messages).length > 40000) {
    return res.status(400).json({ code: "entrada", message: "Frase vazia ou grande demais." });
  }

  try {
    const msg = await client.beta.messages.create({
      model: "claude-opus-5-5",
      max_tokens: 8000,
      output_config: { effort: "low" },
      // se o modelo recusar por política, a API refaz no modelo reserva recomendado
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      messages,
    });
    if (msg.stop_reason === "refusal") return res.status(422).json({ code: "recusou", message: "O Claude não interpretou essa frase." });
    const texto = msg.content.filter((b) => b.type === "text").map((b) => b.text).join("");
    if (!json) return res.status(200).json({ text: texto });
    return res.status(200).json(lerJson(texto));
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) return res.status(500).json({ code: "chave", message: "A chave da API do Claude no Vercel não está certa." });
    if (e instanceof Anthropic.RateLimitError) return res.status(429).json({ code: "rate_limited", message: "Muitas frases seguidas. Tente de novo em instantes." });
    if (e instanceof Anthropic.APIError) return res.status(502).json({ code: "api", message: `API do Claude: ${e.status} ${e.message}` });
    return res.status(502).json({ code: "resposta", message: String((e && e.message) || e) });
  }
}
