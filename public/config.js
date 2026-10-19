/* Endereço e chave pública (publishable) do Supabase do Bilibank. Podem ficar no navegador:
   o que protege os dados é o login e as regras do banco (cada um só vê os próprios documentos).
   No Vercel, se SUPABASE_URL e SUPABASE_ANON_KEY existirem, scripts/montar.mjs reescreve este arquivo com elas.
   Nunca coloque aqui a chave secreta (service_role) nem a chave da API do Claude. */
window.BILI_CONFIG = {
  supabaseUrl: 'https://xfbldlhxrkjjvjdwjcsb.supabase.co',
  supabaseAnonKey: 'sb_publishable_u0b94T3gwFffIay5hFkdqg_n03fIcGj',
  // interpretação pelo Claude: vazio usa o leitor do próprio painel; no Vercel, 'api/interpretar'
  interpretar: ''
};
