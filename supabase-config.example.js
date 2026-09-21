/*
 * Copie este arquivo pra "supabase-config.js" (mesma pasta) e
 * preencha com os valores do seu projeto Supabase — Project Settings
 * > API no painel do Supabase — pra rodar localmente sem precisar
 * configurar variáveis de ambiente.
 *
 * Em produção (Vercel), "supabase-config.js" é gerado automaticamente
 * pelo script de build (scripts/gerar-config.js) a partir das
 * variáveis de ambiente SUPABASE_URL e SUPABASE_KEY — você não
 * precisa mexer nele lá, só configurar as duas variáveis em Project
 * Settings > Environment Variables.
 */
window.SUPABASE_CONFIG = Object.freeze({
    url: 'https://SEU-PROJETO.supabase.co/rest/v1',
    key: 'sb_publishable_SUA_CHAVE_AQUI'
});
