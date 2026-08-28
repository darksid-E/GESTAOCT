/*
 * Configuração pública do PI Web API para o frontend.
 *
 * O navegador chama esse host DIRETO (sem passar por servidor nenhum
 * do app) — só funciona quando o dispositivo está na rede/VPN da
 * Ternium, já que o PI Web API não é alcançável pela internet
 * pública. A autenticação é feita pelo próprio navegador via login
 * do Windows (Kerberos/NTLM), do mesmo jeito que já acontece hoje ao
 * acessar o PI Vision — não precisa (e não deve) colocar usuário/senha
 * aqui.
 *
 * Pré-requisito do lado do TI: habilitar CORS no PI Web API
 * (System Configuration > CORS) liberando o domínio deste app,
 * com suporte a credenciais.
 */
window.PI_CONFIG = Object.freeze({
    baseUrl: 'https://pimsweb.ternium.techint.net/piwebapi',
    server: 'TERBRPPIM01V01',
});
