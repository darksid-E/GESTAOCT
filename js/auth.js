// =========================================================
// --- LOGIN / CADASTRO / RECUPERAÇÃO (Supabase Auth) ---
// =========================================================
import { state, config, salvarSessaoLocal, isAdminAtual, nomeExibicaoAtual, PAGINAS_PERMISSAO, carregarCacheLocal, salvarCacheLocal, carregarCacheLocalMaquinas, salvarCacheLocalMaquinas } from './state.js';
import { listarReparosSupabase, listarMaquinasSupabase } from './supabase-api.js';
import { irParaAba, getNavElements, abaDisponivel, primeiraAbaDisponivel } from './navigation.js';
import { gerarMapaBaterias } from './mapa2d.js';
import { processarDadosGlobais } from './mapa2d.js';
import { renderizarTabela } from './tabela.js';
import { renderizarPaginaMaquinas, renderizarTabelaMaquinas } from './maquinas.js';
import {
    authFetch, buscarPerfilProprio, renovarSessao, sessaoExpirada, encerrarSessaoLocal,
    sincronizarPerfil, iniciarMonitoramentoSessao, ErroAuth
} from './sessao.js';
import { mostrarToast } from './toast.js';

const CHAVE_EMAIL_LEMBRADO = 'emailLembradoCT';
const PAINEIS = ['login', 'cadastro', 'recuperar', 'codigo', 'nova_senha'];
const COOLDOWN_RECUPERACAO_S = 60;

// Dados que vêm do link de "esqueci minha senha" (só em memória) e avisos
// que precisam esperar a interface ficar pronta para serem exibidos.
let tokenRecuperacao = null;
// Fluxo por código de 6 dígitos: { modo: 'recuperacao' | 'cadastro', email }
let fluxoCodigo = null;
let avisoInicial = null;

const $ = (id) => document.getElementById(id);

// Cadastro liberado só para emails corporativos @ternium.com — aceita
// qualquer variação de país (ternium.com, ternium.com.br, ternium.com.us,
// ternium.com.ar, ternium.com.mx etc).
function emailEhDominioTernium(email) {
    return /^[^\s@]+@ternium\.com(\.[a-z]{2,3})?$/i.test(email.trim());
}

function emailValido(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

function traduzirErroAuth(erro) {
    const msg = String(erro?.message || '');
    const m = msg.toLowerCase();
    if (erro instanceof TypeError || m.includes('failed to fetch') || m.includes('networkerror') || m.includes('load failed')) {
        return 'Sem conexão com o servidor. Verifique sua rede e tente novamente.';
    }
    if (m.includes('invalid login credentials')) return 'Email ou senha incorretos.';
    if (m.includes('email not confirmed')) return 'Email ainda não confirmado. Verifique sua caixa de entrada.';
    if (m.includes('already registered') || m.includes('already been registered')) return 'Este email já está cadastrado.';
    if (m.includes('at least 6 characters')) return 'A senha precisa ter pelo menos 6 caracteres.';
    if (m.includes('different from the old password')) return 'A nova senha precisa ser diferente da atual.';
    const segundos = m.match(/after (\d+) seconds?/);
    if (segundos) return `Aguarde ${segundos[1]} segundos para tentar novamente.`;
    if (m.includes('rate limit')) return 'Muitas tentativas. Aguarde alguns minutos e tente novamente.';
    if (m.includes('token has expired') || m.includes('otp_expired') || m.includes('invalid otp')) return 'Código inválido ou expirado. Confira os números ou solicite um novo código.';
    if (m.includes('expired') || m.includes('invalid or has expired') || m.includes('otp')) return 'O link expirou ou já foi utilizado. Solicite um novo.';
    return msg || 'Não foi possível concluir a operação.';
}

// --- Chamadas de Auth ---

async function cadastrarComEmailSenha(email, senha, dadosPerfil) {
    // IMPORTANTE: chamamos a API REST do GoTrue diretamente (não o
    // supabase-js), então o formato do payload é o da API "crua":
    //   - "data" (user_metadata) vai solto no corpo, e NÃO dentro de
    //     "options" (isso é só um envelope do supabase-js).
    //   - o redirect do email de confirmação vai como query string
    //     "?redirect_to=...". Essa URL também precisa estar em
    //     Authentication > URL Configuration > Redirect URLs no Supabase.
    // nome/sobrenome/matrícula vão como "user_metadata": ficam no
    // próprio auth.users e chegam intactos mesmo se a confirmação do
    // email abrir em outra aba ou aparelho.
    return authFetch(`/signup?redirect_to=${encodeURIComponent(urlDoApp())}`, {
        method: 'POST',
        body: JSON.stringify({ email, password: senha, data: dadosPerfil })
    });
}

function urlDoApp() {
    return window.location.href.split('#')[0].split('?')[0];
}

function entrarComEmailSenha(email, senha) {
    return authFetch('/token?grant_type=password', { method: 'POST', body: JSON.stringify({ email, password: senha }) });
}

function solicitarRecuperacaoSenha(email) {
    return authFetch(`/recover?redirect_to=${encodeURIComponent(urlDoApp())}`, { method: 'POST', body: JSON.stringify({ email }) });
}

function verificarCodigoEmail(tipo, email, codigo) {
    return authFetch('/verify', { method: 'POST', body: JSON.stringify({ type: tipo, email, token: codigo }) });
}

function reenviarCodigoCadastro(email) {
    return authFetch(`/resend?redirect_to=${encodeURIComponent(urlDoApp())}`, { method: 'POST', body: JSON.stringify({ type: 'signup', email }) });
}

function definirNovaSenha(accessToken, senha) {
    return authFetch('/user', {
        method: 'PUT',
        headers: { Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ password: senha })
    });
}

async function sairAuth() {
    if (state.sessaoAtual?.access_token) {
        try {
            await fetch(`${config.SUPABASE_AUTH_BASE}/logout`, {
                method: 'POST',
                headers: { apikey: config.SUPABASE_KEY, Authorization: `Bearer ${state.sessaoAtual.access_token}` }
            });
        } catch (erro) { console.warn('Falha ao encerrar sessão no servidor:', erro); }
    }
    encerrarSessaoLocal('saida');
}

async function criarPerfilProprio(userId, tokenAcesso, dados) {
    const enviar = (corpo) => fetch(`${config.SUPABASE_URL}/${config.SUPABASE_TABLE_PERFIS}`, {
        method: 'POST',
        headers: { apikey: config.SUPABASE_KEY, Authorization: `Bearer ${tokenAcesso}`, 'Content-Type': 'application/json', Prefer: 'return=representation' },
        body: JSON.stringify({ id: userId, ...corpo, isAdmin: false })
    });
    let resposta = await enviar(dados);
    // Se o SQL de permissões ainda não foi rodado, a coluna "email" não
    // existe: cria o perfil sem ela em vez de impedir o primeiro acesso.
    if (!resposta.ok && dados.email !== undefined) {
        const { email, ...semEmail } = dados;
        resposta = await enviar(semEmail);
    }
    if (!resposta.ok) throw new Error(`Supabase ${resposta.status}: ${await resposta.text()}`);
    const lista = await resposta.json();
    return lista[0];
}

// Monta a sessão local a partir de uma resposta do /token ou /signup
// (quando a confirmação de email está desligada no projeto, o signup já
// retorna os tokens, como se fosse um login).
// Retorna { perfil, erroPerfil } pra quem chamou poder avisar o usuário
// caso o perfil não tenha sido salvo (em vez de falhar em silêncio).
async function iniciarSessaoAPartirDoToken(tokenResposta) {
    const expiresAt = Date.now() + (tokenResposta.expires_in || 3600) * 1000;
    let perfil = null;
    let erroPerfil = null;
    try {
        perfil = await buscarPerfilProprio(tokenResposta.user.id, tokenResposta.access_token);
        if (!perfil) {
            // Primeiro acesso depois do cadastro: cria a linha de perfil
            // com os dados salvos no user_metadata (preenchidos no
            // cadastro). isAdmin sempre nasce false.
            const meta = tokenResposta.user?.user_metadata || {};
            perfil = await criarPerfilProprio(tokenResposta.user.id, tokenResposta.access_token, {
                nome: meta.nome || '',
                sobrenome: meta.sobrenome || '',
                matricula: meta.matricula || '',
                email: tokenResposta.user?.email
            });
        }
    } catch (erro) {
        console.error('Erro ao carregar/criar perfil:', erro);
        erroPerfil = erro.message;
    }

    salvarSessaoLocal({
        access_token: tokenResposta.access_token,
        refresh_token: tokenResposta.refresh_token,
        expires_at: expiresAt,
        user: tokenResposta.user,
        perfil
    });
    iniciarMonitoramentoSessao();

    return { perfil, erroPerfil };
}

// --- Interface: painéis, mensagens, validação ---

function mostrarPainelAuth(nome, { focar = true } = {}) {
    PAINEIS.forEach(p => { const el = $(`painel_${p}`); if (el) el.hidden = p !== nome; });
    limparFeedback();
    if (focar) {
        const primeiro = $(`painel_${nome}`)?.querySelector('input:not([type="checkbox"])');
        // setTimeout: o painel acabou de ser exibido e só aceita foco no próximo ciclo
        if (primeiro) setTimeout(() => primeiro.focus(), 30);
    }
}

// Prepara e exibe o painel de código (login por código enviado por email,
// sem precisar clicar em link — links do Supabase podem ser barrados pela
// rede/filtro de email corporativo).
function abrirPainelCodigo(modo, email, mensagem) {
    fluxoCodigo = { modo, email };
    const recuperacao = modo === 'recuperacao';
    $('codigo_titulo').textContent = recuperacao ? 'Redefinir senha' : 'Confirmar cadastro';
    $('btn_codigo').textContent = recuperacao ? 'Salvar senha' : 'Confirmar';
    $('codigo_campos_senha').hidden = !recuperacao;
    ['codigo_valor', 'codigo_senha', 'codigo_senha_confirma'].forEach(id => { $(id).value = ''; });
    mostrarPainelAuth('codigo');
    if (mensagem) mostrarMensagem('codigo', mensagem, 'sucesso');
}

function mostrarMensagem(painel, texto, tipo = 'erro') {
    const el = $(`msg_${painel}`);
    if (!el) return;
    el.textContent = texto || '';
    el.className = `auth_msg ${tipo}`;
    el.hidden = !texto;
}

function limparFeedback() {
    PAINEIS.forEach(p => mostrarMensagem(p, ''));
    document.querySelectorAll('.auth_campo input.invalido').forEach(i => i.classList.remove('invalido'));
}

function marcarInvalidos(ids) {
    ids.forEach(id => $(id)?.classList.add('invalido'));
    if (ids.length) $(ids[0])?.focus();
}

function definirCarregando(btn, ativo, textoCarregando) {
    if (!btn) return;
    if (ativo) {
        btn.dataset.rotulo = btn.textContent;
        btn.textContent = textoCarregando;
        btn.disabled = true;
    } else {
        btn.textContent = btn.dataset.rotulo || btn.textContent;
        btn.disabled = false;
    }
}

function iniciarCooldown(btn, segundos, rotuloFinal) {
    let restante = segundos;
    btn.disabled = true;
    const tick = () => {
        if (restante <= 0) { btn.textContent = rotuloFinal; btn.disabled = false; return; }
        btn.textContent = `Reenviar em ${restante}s`;
        restante -= 1;
        setTimeout(tick, 1000);
    };
    tick();
}

function iniciaisDe(perfil, email) {
    const base = perfil ? `${perfil.nome || ''} ${perfil.sobrenome || ''}`.trim() : '';
    if (base) {
        const partes = base.split(/\s+/);
        return (partes[0][0] + (partes.length > 1 ? partes[partes.length - 1][0] : '')).toUpperCase();
    }
    return (email || '?')[0].toUpperCase();
}

function renderizarCadastroUI() {
    const cartaoLogin = $('auth_card');
    const cartaoLogado = $('cadastro_status_logado');
    if (!cartaoLogin || !cartaoLogado) return;

    const sessao = state.sessaoAtual;
    cartaoLogin.hidden = !!sessao;
    cartaoLogado.hidden = !sessao;

    if (!sessao) {
        if (PAINEIS.every(p => $(`painel_${p}`)?.hidden)) mostrarPainelAuth('login', { focar: false });
        return;
    }

    const p = sessao.perfil;
    const email = sessao.user?.email || '';
    $('auth_avatar').textContent = iniciaisDe(p, email);
    $('auth_nome').textContent = nomeExibicaoAtual();
    $('auth_matricula').textContent = p?.matricula || '-';
    $('auth_email').textContent = email;
    const badge = $('auth_badge');
    badge.textContent = p?.isDev ? 'Desenvolvedor' : (p?.isAdmin ? 'Administrador' : 'Somente Navegação');
    badge.className = `badge_admin ${(p?.isAdmin || p?.isDev) ? 'sim' : 'nao'}`;
}

function aplicarEstadoSessao() {
    renderizarCadastroUI();
    aplicarPermissoes();
}

// Depois de entrar: mostra o cartão do usuário, busca os dados que a
// pessoa tem permissão de ver (antes do login o banco devolve vazio) e
// aplica as permissões.
async function aposLogin() {
    renderizarCadastroUI();
    await recarregarDados();
    aplicarPermissoes();
}

// Mostra/esconde as abas do menu lateral conforme login e permissões:
// sem sessão só "Login"; logado, cada página de PAGINAS_PERMISSAO depende
// da coluna ver_<pagina> do perfil e "Permissões" é só para admins. Se a
// aba aberta deixar de estar disponível, a pessoa é levada para outra.
export function aplicarVisibilidadeAbas() {
    const { navButtons, pageSections } = getNavElements();

    navButtons.forEach(btn => {
        btn.style.display = abaDisponivel(btn.getAttribute('data-target')) ? '' : 'none';
    });

    const secaoAtiva = Array.from(pageSections).find(s => s.classList.contains('active_section'));
    if (secaoAtiva && !abaDisponivel(secaoAtiva.id)) {
        irParaAba(state.sessaoAtual ? primeiraAbaDisponivel() : 'cadastro');
    }
}
window.aplicarVisibilidadeAbas = aplicarVisibilidadeAbas;

// Aplica as permissões de admin/navegação em toda a interface
export function aplicarPermissoes() {
    aplicarVisibilidadeAbas();
    const admin = isAdminAtual();

    const btnNovoReparo = document.getElementById('btn_abrir_manual');
    if (btnNovoReparo) btnNovoReparo.style.display = admin ? '' : 'none';

    const btnNovoTabela = document.getElementById('btn_novo_tabela');
    if (btnNovoTabela) btnNovoTabela.style.display = admin ? '' : 'none';

    const btnImportar = document.getElementById('btn_trigger_import');
    if (btnImportar) btnImportar.style.display = admin ? '' : 'none';

    const camposModal = document.querySelectorAll(
        '#modal_reparo .col_form select, #modal_reparo .col_form textarea, ' +
        '#modal_reparo .col_form input, #modal_reparo .col_form button'
    );
    camposModal.forEach(el => { el.disabled = !admin; });

    document.querySelectorAll('#modal_reparo .file_upload_label').forEach(lbl => {
        lbl.classList.toggle('disabled', !admin);
    });

    const btnNovoMaquina = document.getElementById('btn_abrir_manual_maquina');
    if (btnNovoMaquina) btnNovoMaquina.style.display = admin ? '' : 'none';

    const btnNovoTabelaMaquina = document.getElementById('btn_novo_tabela_maquina');
    if (btnNovoTabelaMaquina) btnNovoTabelaMaquina.style.display = admin ? '' : 'none';

    const camposModalMaquina = document.querySelectorAll(
        '#modal_maquina .form_group select, #modal_maquina .form_group textarea, ' +
        '#modal_maquina .form_group input, #modal_maquina .botoes_form button'
    );
    camposModalMaquina.forEach(el => { el.disabled = !admin; });

    if (document.getElementById('tbody_banco')) renderizarTabela();
    if (document.getElementById('tbody_banco_maquinas')) renderizarTabelaMaquinas();
}
window.aplicarPermissoes = aplicarPermissoes;


// --- Retorno de links enviados por email ---

// O Supabase redireciona de volta pra cá com os dados no #hash da URL:
//  - confirmação de cadastro -> tokens (loga direto)
//  - "esqueci minha senha"   -> tokens + type=recovery (pede nova senha)
//  - link inválido/expirado  -> error=...&error_description=...
// Retorna 'login' | 'recuperacao' | 'erro' | null.
async function processarRedirectAuth() {
    const hash = window.location.hash;
    if (!hash || hash.length < 2) return null;

    const params = new URLSearchParams(hash.substring(1));
    const limparHash = () => history.replaceState(null, '', window.location.pathname + window.location.search);

    if (params.get('error') || params.get('error_code')) {
        limparHash();
        avisoInicial = { painel: 'login', tipo: 'erro', texto: traduzirErroAuth(new Error(params.get('error_description') || 'link expired')) };
        return 'erro';
    }

    const accessToken = params.get('access_token');
    if (!accessToken) return null;
    const dadosToken = {
        access_token: accessToken,
        refresh_token: params.get('refresh_token'),
        expires_in: Number(params.get('expires_in')) || 3600
    };

    if (params.get('type') === 'recovery') {
        tokenRecuperacao = dadosToken;
        limparHash();
        return 'recuperacao';
    }

    try {
        const respostaUser = await fetch(`${config.SUPABASE_AUTH_BASE}/user`, {
            headers: { apikey: config.SUPABASE_KEY, Authorization: `Bearer ${accessToken}` }
        });
        if (!respostaUser.ok) throw new Error(`Supabase ${respostaUser.status}`);
        const user = await respostaUser.json();

        const { erroPerfil } = await iniciarSessaoAPartirDoToken({ ...dadosToken, user });
        limparHash();

        if (erroPerfil) {
            avisoInicial = { toast: true, tipo: 'erro', texto: `Email confirmado, mas houve um problema ao salvar seu perfil: ${erroPerfil}` };
        } else {
            avisoInicial = { toast: true, tipo: 'sucesso', texto: `Email confirmado! Bem-vindo(a), ${nomeExibicaoAtual()}.` };
        }
        return 'login';
    } catch (erro) {
        console.error('Erro ao processar confirmação de email:', erro);
        limparHash();
        avisoInicial = { painel: 'login', tipo: 'erro', texto: 'Não foi possível concluir a confirmação do email. Tente entrar normalmente.' };
        return 'erro';
    }
}

function exibirAvisoInicial(retorno) {
    if (retorno === 'recuperacao') {
        irParaAba('cadastro');
        mostrarPainelAuth('nova_senha');
        return;
    }
    if (!avisoInicial) return;
    const aviso = avisoInicial;
    avisoInicial = null;
    if (aviso.toast) {
        mostrarToast(aviso.texto, aviso.tipo, aviso.tipo === 'erro' ? 9000 : 5000);
    } else {
        irParaAba('cadastro');
        mostrarPainelAuth(aviso.painel, { focar: false });
        mostrarMensagem(aviso.painel, aviso.texto, aviso.tipo);
    }
}

// --- Handlers dos formulários (Enter dispara o submit nativo) ---

function irParaPaginaInicial() {
    const destino = primeiraAbaDisponivel();
    document.querySelector(`.nav_btn[data-target="${destino}"]`)?.click();
}

async function aoEntrar(evento) {
    evento.preventDefault();
    const btn = $('btn_entrar_cadastro');
    const email = $('login_email').value.trim();
    const senha = $('login_senha').value;
    limparFeedback();

    const faltando = [];
    if (!email) faltando.push('login_email');
    if (!senha) faltando.push('login_senha');
    if (faltando.length) {
        mostrarMensagem('login', 'Informe email e senha para entrar.');
        return marcarInvalidos(faltando);
    }
    if (!state.supabaseAtivo) return mostrarMensagem('login', 'Supabase não está configurado no momento.');

    definirCarregando(btn, true, 'Entrando...');
    try {
        const resultado = await entrarComEmailSenha(email, senha);
        const { erroPerfil } = await iniciarSessaoAPartirDoToken(resultado);

        if ($('login_lembrar').checked) localStorage.setItem(CHAVE_EMAIL_LEMBRADO, email);
        else localStorage.removeItem(CHAVE_EMAIL_LEMBRADO);

        $('login_senha').value = '';
        await aposLogin();
        if (erroPerfil) mostrarToast(`Login feito, mas houve um problema ao carregar seu perfil: ${erroPerfil}`, 'erro', 9000);
        else mostrarToast(`Bem-vindo(a), ${nomeExibicaoAtual()}!`, 'sucesso');
        irParaPaginaInicial();
    } catch (erro) {
        console.error('Erro ao entrar:', erro);
        mostrarMensagem('login', traduzirErroAuth(erro));
        if (erro instanceof ErroAuth && erro.status === 400) { $('login_senha').value = ''; marcarInvalidos(['login_senha']); }
    } finally {
        definirCarregando(btn, false);
    }
}

async function aoCadastrar(evento) {
    evento.preventDefault();
    const btn = $('btn_cadastrar');
    const nome = $('cad_nome').value.trim();
    const sobrenome = $('cad_sobrenome').value.trim();
    const matricula = $('cad_matricula').value.trim();
    const email = $('cad_email').value.trim();
    const senha = $('cad_senha').value;
    const senhaConfirma = $('cad_senha_confirma').value;
    limparFeedback();

    const obrigatorios = [['cad_nome', nome], ['cad_sobrenome', sobrenome], ['cad_matricula', matricula], ['cad_email', email], ['cad_senha', senha]];
    const vazios = obrigatorios.filter(([, v]) => !v).map(([id]) => id);
    if (vazios.length) {
        mostrarMensagem('cadastro', 'Preencha todos os campos do cadastro.');
        return marcarInvalidos(vazios);
    }
    if (!emailEhDominioTernium(email)) {
        mostrarMensagem('cadastro', 'O cadastro é permitido apenas com email corporativo @ternium.com.');
        return marcarInvalidos(['cad_email']);
    }
    if (senha.length < 6) {
        mostrarMensagem('cadastro', 'A senha precisa ter pelo menos 6 caracteres.');
        return marcarInvalidos(['cad_senha']);
    }
    if (senha !== senhaConfirma) {
        mostrarMensagem('cadastro', 'As senhas não conferem.');
        return marcarInvalidos(['cad_senha_confirma']);
    }
    if (!state.supabaseAtivo) return mostrarMensagem('cadastro', 'Supabase não está configurado no momento.');

    definirCarregando(btn, true, 'Criando conta...');
    try {
        const resultado = await cadastrarComEmailSenha(email, senha, { nome, sobrenome, matricula });

        // Com confirmação de email ligada, o Supabase devolve um usuário
        // "fantasma" (sem identities) quando o email já existe.
        const identities = resultado?.user?.identities ?? resultado?.identities;
        if (Array.isArray(identities) && identities.length === 0) {
            mostrarMensagem('cadastro', 'Este email já está cadastrado.');
            return marcarInvalidos(['cad_email']);
        }

        ['cad_nome', 'cad_sobrenome', 'cad_matricula', 'cad_senha', 'cad_senha_confirma'].forEach(id => { $(id).value = ''; });

        if (resultado.access_token) {
            // Confirmação de email desligada no projeto: já vem logado
            const { erroPerfil } = await iniciarSessaoAPartirDoToken(resultado);
            $('cad_email').value = '';
            await aposLogin();
            if (erroPerfil) mostrarToast(`Sua conta foi criada, mas houve um problema ao salvar o perfil: ${erroPerfil}`, 'erro', 9000);
            else mostrarToast(`Cadastro realizado, ${nome}! Você está como usuário de navegação até um administrador liberar sua permissão.`, 'sucesso', 8000);
            irParaPaginaInicial();
        } else {
            $('login_email').value = email;
            $('cad_email').value = '';
            abrirPainelCodigo('cadastro', email, `Cadastro realizado! Enviamos um código para ${email}.`);
        }
    } catch (erro) {
        console.error('Erro ao cadastrar usuário:', erro);
        mostrarMensagem('cadastro', traduzirErroAuth(erro));
    } finally {
        definirCarregando(btn, false);
    }
}

async function aoRecuperarSenha(evento) {
    evento.preventDefault();
    const btn = $('btn_recuperar');
    const email = $('rec_email').value.trim();
    limparFeedback();

    if (!email || !emailValido(email)) {
        mostrarMensagem('recuperar', 'Informe um email válido.');
        return marcarInvalidos(['rec_email']);
    }
    if (!state.supabaseAtivo) return mostrarMensagem('recuperar', 'Supabase não está configurado no momento.');

    definirCarregando(btn, true, 'Enviando...');
    try {
        await solicitarRecuperacaoSenha(email);
        // Mesma resposta exista ou não conta com esse email (não revela quem é cadastrado)
        abrirPainelCodigo('recuperacao', email, `Se ${email} estiver cadastrado, enviamos um código para ele.`);
        iniciarCooldown($('btn_reenviar_codigo'), COOLDOWN_RECUPERACAO_S, 'Reenviar código');
    } catch (erro) {
        console.error('Erro ao solicitar recuperação de senha:', erro);
        mostrarMensagem('recuperar', traduzirErroAuth(erro));
    } finally {
        definirCarregando(btn, false);
    }
}

async function aoDefinirNovaSenha(evento) {
    evento.preventDefault();
    const btn = $('btn_nova_senha');
    const senha = $('nova_senha').value;
    const confirma = $('nova_senha_confirma').value;
    limparFeedback();

    if (!tokenRecuperacao) {
        mostrarMensagem('nova_senha', 'O link de recuperação não é mais válido. Solicite um novo.');
        return;
    }
    if (senha.length < 6) {
        mostrarMensagem('nova_senha', 'A senha precisa ter pelo menos 6 caracteres.');
        return marcarInvalidos(['nova_senha']);
    }
    if (senha !== confirma) {
        mostrarMensagem('nova_senha', 'As senhas não conferem.');
        return marcarInvalidos(['nova_senha_confirma']);
    }

    definirCarregando(btn, true, 'Salvando...');
    try {
        const user = await definirNovaSenha(tokenRecuperacao.access_token, senha);
        const { erroPerfil } = await iniciarSessaoAPartirDoToken({ ...tokenRecuperacao, user });
        tokenRecuperacao = null;
        $('nova_senha').value = '';
        $('nova_senha_confirma').value = '';
        await aposLogin();
        if (erroPerfil) mostrarToast(`Senha redefinida, mas houve um problema ao carregar seu perfil: ${erroPerfil}`, 'erro', 9000);
        else mostrarToast('Senha redefinida com sucesso.', 'sucesso');
        irParaPaginaInicial();
    } catch (erro) {
        console.error('Erro ao redefinir senha:', erro);
        mostrarMensagem('nova_senha', traduzirErroAuth(erro));
    } finally {
        definirCarregando(btn, false);
    }
}

async function aoConfirmarCodigo(evento) {
    evento.preventDefault();
    if (!fluxoCodigo) return mostrarPainelAuth('login');
    const { modo, email } = fluxoCodigo;
    const recuperacao = modo === 'recuperacao';
    const btn = $('btn_codigo');
    const codigo = $('codigo_valor').value.replace(/\s+/g, '');
    const senha = $('codigo_senha').value;
    const confirma = $('codigo_senha_confirma').value;
    limparFeedback();

    if (!/^\d{6,10}$/.test(codigo)) {
        mostrarMensagem('codigo', 'Informe o código numérico recebido por email.');
        return marcarInvalidos(['codigo_valor']);
    }
    if (recuperacao) {
        if (senha.length < 6) {
            mostrarMensagem('codigo', 'A senha precisa ter pelo menos 6 caracteres.');
            return marcarInvalidos(['codigo_senha']);
        }
        if (senha !== confirma) {
            mostrarMensagem('codigo', 'As senhas não conferem.');
            return marcarInvalidos(['codigo_senha_confirma']);
        }
    }

    definirCarregando(btn, true, 'Verificando...');
    try {
        const sessaoVerificada = await verificarCodigoEmail(recuperacao ? 'recovery' : 'signup', email, codigo);
        let tokens = sessaoVerificada;
        if (recuperacao) {
            const user = await definirNovaSenha(sessaoVerificada.access_token, senha);
            tokens = { ...sessaoVerificada, user };
        }
        const { erroPerfil } = await iniciarSessaoAPartirDoToken(tokens);
        fluxoCodigo = null;
        ['codigo_valor', 'codigo_senha', 'codigo_senha_confirma'].forEach(id => { $(id).value = ''; });
        await aposLogin();
        if (erroPerfil) mostrarToast(`Login feito, mas houve um problema ao carregar seu perfil: ${erroPerfil}`, 'erro', 9000);
        else mostrarToast(recuperacao ? 'Senha redefinida com sucesso.' : `Cadastro confirmado! Bem-vindo(a), ${nomeExibicaoAtual()}.`, 'sucesso');
        irParaPaginaInicial();
    } catch (erro) {
        console.error('Erro ao confirmar código:', erro);
        mostrarMensagem('codigo', traduzirErroAuth(erro));
        marcarInvalidos(['codigo_valor']);
    } finally {
        definirCarregando(btn, false);
    }
}

async function aoReenviarCodigo() {
    if (!fluxoCodigo) return;
    const btn = $('btn_reenviar_codigo');
    const { modo, email } = fluxoCodigo;
    limparFeedback();
    btn.disabled = true;
    try {
        if (modo === 'recuperacao') await solicitarRecuperacaoSenha(email);
        else await reenviarCodigoCadastro(email);
        mostrarMensagem('codigo', `Novo código enviado para ${email}.`, 'sucesso');
        iniciarCooldown(btn, COOLDOWN_RECUPERACAO_S, 'Reenviar código');
    } catch (erro) {
        console.error('Erro ao reenviar código:', erro);
        mostrarMensagem('codigo', traduzirErroAuth(erro));
        btn.disabled = false;
    }
}

function alternarVisibilidadeSenha(botao) {
    const input = $(botao.dataset.alvo);
    if (!input) return;
    const mostrar = input.type === 'password';
    input.type = mostrar ? 'text' : 'password';
    botao.setAttribute('aria-label', mostrar ? 'Ocultar senha' : 'Mostrar senha');
    botao.querySelector('use')?.setAttribute('href', mostrar ? '#i-eye-off' : '#i-eye');
}

function aplicarEmailLembrado() {
    const salvo = localStorage.getItem(CHAVE_EMAIL_LEMBRADO);
    if (!salvo) return;
    $('login_email').value = salvo;
    $('login_lembrar').checked = true;
}

export function initAuth() {
    aplicarEmailLembrado();

    $('painel_login')?.addEventListener('submit', aoEntrar);
    $('painel_cadastro')?.addEventListener('submit', aoCadastrar);
    $('painel_recuperar')?.addEventListener('submit', aoRecuperarSenha);
    $('painel_codigo')?.addEventListener('submit', aoConfirmarCodigo);
    $('btn_reenviar_codigo')?.addEventListener('click', aoReenviarCodigo);
    $('painel_nova_senha')?.addEventListener('submit', aoDefinirNovaSenha);

    $('auth_card')?.addEventListener('click', (e) => {
        const toggle = e.target.closest('.auth_toggle_senha');
        if (toggle) return alternarVisibilidadeSenha(toggle);

        const ir = e.target.closest('[data-auth-ir]');
        if (!ir) return;
        const destino = ir.dataset.authIr;
        if (destino === 'recuperar') $('rec_email').value = $('login_email').value.trim();
        if (destino === 'login') { tokenRecuperacao = null; fluxoCodigo = null; }
        mostrarPainelAuth(destino);
    });

    // Tirar o destaque vermelho assim que a pessoa volta a digitar
    $('auth_card')?.addEventListener('input', (e) => e.target.classList?.remove('invalido'));

    $('btn_sair_cadastro')?.addEventListener('click', async () => {
        const btn = $('btn_sair_cadastro');
        btn.disabled = true;
        await sairAuth();
        btn.disabled = false;
    });

    // --- Eventos vindos de sessao.js ---
    window.addEventListener('sessao:perfil', async (e) => {
        const { anterior, atual } = e.detail;
        const mudou = assinaturaPermissoes(anterior) !== assinaturaPermissoes(atual);
        renderizarCadastroUI();
        if (mudou) await recarregarDados();     // o que a pessoa pode ver mudou
        aplicarPermissoes();
        if (anterior && anterior.isAdmin !== atual.isAdmin) {
            mostrarToast(atual.isAdmin
                ? 'Permissão atualizada: você agora é Administrador.'
                : 'Permissão atualizada: seu acesso de administrador foi removido.', 'info', 7000);
        } else if (mudou) {
            mostrarToast('Suas permissões de acesso foram atualizadas.', 'info', 7000);
        }
    });

    window.addEventListener('sessao:encerrada', (e) => {
        limparDadosEmMemoria();
        mostrarPainelAuth('login', { focar: false });
        aplicarEstadoSessao();
        if (e.detail?.motivo === 'expirada') {
            mostrarMensagem('login', 'Sua sessão expirou. Entre novamente.');
            mostrarToast('Sua sessão expirou. Entre novamente.', 'erro', 7000);
        }
    });

    // Login/logout/renovação feito em outra aba do mesmo navegador
    window.addEventListener('sessao:externa', async () => {
        if (!state.sessaoAtual) { limparDadosEmMemoria(); mostrarPainelAuth('login', { focar: false }); }
        else await recarregarDados();
        aplicarEstadoSessao();
    });
}

// Resumo do que define o acesso: se mudar, os dados precisam ser relidos.
function assinaturaPermissoes(perfil) {
    if (!perfil) return '';
    return JSON.stringify([perfil.isAdmin === true, perfil.isDev === true, ...PAGINAS_PERMISSAO.map(p => perfil[`ver_${p.id}`] !== false)]);
}

// Ao abrir o app: renova o token se já venceu e traz o perfil atual do
// servidor (assim mudanças de permissão feitas no Supabase aparecem
// mesmo sem sair e entrar).
async function restaurarSessaoAoIniciar() {
    if (!state.sessaoAtual) return;
    if (!state.sessaoAtual.refresh_token) { salvarSessaoLocal(null); return; }

    if (sessaoExpirada()) {
        try { await renovarSessao(); }
        catch (erro) { console.warn('Não foi possível renovar a sessão ao iniciar:', erro); }
    }
    if (state.sessaoAtual) await sincronizarPerfil({ forcar: true });
}

// Carrega reparos e máquinas do Supabase (com cache local como plano B).
// O banco só devolve o que a pessoa pode ver (RLS por página), então isto
// precisa rodar de novo sempre que login/permissões mudam.
async function carregarDados() {
    try {
        state.dbReparos = await listarReparosSupabase();
        salvarCacheLocal();
    } catch (erro) {
        console.error('Falha ao carregar o Supabase. Usando cache local:', erro);
        state.supabaseAtivo = false;
        state.dbReparos = carregarCacheLocal();
        if (config.SUPABASE_URL && config.SUPABASE_KEY) {
            mostrarToast('Não foi possível carregar os dados do Supabase. O app abriu com o cache local.', 'erro', 9000);
        }
    }

    try {
        if (state.supabaseAtivo) {
            state.dbMaquinas = await listarMaquinasSupabase();
            salvarCacheLocalMaquinas();
        } else {
            state.dbMaquinas = carregarCacheLocalMaquinas();
        }
    } catch (erro) {
        console.error('Falha ao carregar lançamentos de máquinas. Usando cache local:', erro);
        state.dbMaquinas = carregarCacheLocalMaquinas();
    }
}

// Redesenha mapa/máquinas/tabelas com os dados em memória.
function redesenharDados() {
    processarDadosGlobais();
    renderizarPaginaMaquinas();
    if (document.getElementById('tbody_banco')) renderizarTabela();
    if (document.getElementById('tbody_banco_maquinas')) renderizarTabelaMaquinas();
}

async function recarregarDados() {
    await carregarDados();
    redesenharDados();
}

// Ao sair: nada dos dados fica na tela nem no cache do navegador.
function limparDadosEmMemoria() {
    state.dbReparos = [];
    state.dbMaquinas = [];
    salvarCacheLocal();
    salvarCacheLocalMaquinas();
    redesenharDados();
}

export async function inicializarApp() {
    const retornoLink = await processarRedirectAuth();
    if (retornoLink !== 'login') await restaurarSessaoAoIniciar();

    await carregarDados();

    window.mapaStatusAtual = {};
    gerarMapaBaterias();
    processarDadosGlobais();
    renderizarPaginaMaquinas();
    renderizarCadastroUI();
    aplicarPermissoes();
    iniciarMonitoramentoSessao();
    exibirAvisoInicial(retornoLink);
}
