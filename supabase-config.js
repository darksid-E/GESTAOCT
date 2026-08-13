/*
 * Configuração pública do Supabase para o frontend.
 *
 * A chave sb_publishable_ não é uma chave secreta: ela foi feita para uso no
 * cliente. Não coloque aqui uma service_role key ou qualquer chave secreta.
 * A proteção dos dados é feita pelas políticas RLS do schema_supabase.sql.
 */
window.SUPABASE_CONFIG = Object.freeze({
    url: 'https://zgedwhztqvxjnfgekbse.supabase.co/rest/v1',
    key: 'sb_publishable_RWnPT8vPvolLVJ419TYEpA_Ajs3mx_o'
});
