/* Monta public/index.html a partir do painel (painel/bilibank.html, o mesmo publicado no Claude).
   O painel é escrito sem <html>/<head>; aqui ele ganha a casca de app: metas do iPhone, manifesto,
   service worker e o bili-app.js, que liga os dados ao Supabase e a interpretação à API do Claude.
   No Vercel ele roda sozinho a cada publicação e também escreve public/config.js com o endereço e a
   chave pública do Supabase (variáveis SUPABASE_URL e SUPABASE_ANON_KEY). Localmente: npm run montar */
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";

const raiz = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const painel = readFileSync(path.join(raiz, "painel/bilibank.html"), "utf8");

const corte = painel.indexOf('<div class="app">');
if (corte < 0) throw new Error('Não achei <div class="app"> no painel.');
const cabeca = painel.slice(0, corte).replace(/<meta name="claude:[^>]*>\s*/g, "");
const corpo = painel.slice(corte);

const html = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#000000">
<meta name="color-scheme" content="dark">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="Bilibank">
<meta name="bili-versao" content="__VERSAO__">
<link rel="manifest" href="manifest.webmanifest">
<link rel="apple-touch-icon" href="icons/apple-touch-icon.png">
<link rel="icon" type="image/png" href="icons/icon-192.png">
${cabeca.trim()}
<style>html,body{margin:0;-webkit-text-size-adjust:100%}body{overscroll-behavior-y:none}</style>
<script src="config.js"></script>
<script src="vendor/supabase-2.117.2.js"></script>
<script src="bili-app.js"></script>
</head>
<body>
${corpo.trim()}
<script>if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));</script>
</body>
</html>
`;
/* versão da montagem: o app aberto confere versao.txt ao voltar para a tela e recarrega se mudou */
const versao = createHash("sha256").update(html).update(readFileSync(path.join(raiz, "public/bili-app.js"))).digest("hex").slice(0, 12);
writeFileSync(path.join(raiz, "public/index.html"), html.replace("__VERSAO__", versao));
writeFileSync(path.join(raiz, "public/versao.txt"), versao + "\n");
console.log("public/index.html montado (" + Math.round(html.length / 1024) + " KB, versão " + versao + ")");

/* só a chave pública (publishable ou anon) vai para o navegador; a service_role e a do Claude nunca */
const url = (process.env.SUPABASE_URL || "").trim(), anon = (process.env.SUPABASE_ANON_KEY || "").trim();
if (url && anon) {
  if (anon.startsWith("sb_secret_") || /service_role/.test(Buffer.from(anon.split(".")[1] || "", "base64").toString())) {
    throw new Error("SUPABASE_ANON_KEY está com a chave secreta. Use a chave pública (publishable ou anon).");
  }
  writeFileSync(path.join(raiz, "public/config.js"),
    `/* gerado por scripts/montar.mjs a partir das variáveis do Vercel */\nwindow.BILI_CONFIG = ${JSON.stringify({ supabaseUrl: url, supabaseAnonKey: anon, interpretar: "api/interpretar" })};\n`);
  console.log("public/config.js escrito com o Supabase de " + new URL(url).host);
}
