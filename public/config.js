/* Endereço e chave pública do Supabase. No Vercel este arquivo é reescrito na publicação a partir das
   variáveis SUPABASE_URL e SUPABASE_ANON_KEY (ver scripts/montar.mjs). As duas podem ficar no navegador:
   o que protege os dados é o login e as regras do banco (cada um só vê os próprios documentos).
   Nunca coloque aqui a chave secreta (service_role) nem a chave da API do Claude. */
window.BILI_CONFIG = {
  supabaseUrl: '',
  supabaseAnonKey: ''
};
