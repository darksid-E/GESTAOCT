// =========================================================
// --- CICLO DE VIDA DA SESSÃO (token, renovação, perfil) ---
// =========================================================
// O access_token do Supabase dura 1h. Antes, a renovação só acontecia ao
// abrir o app; quem ficava com a aba aberta por mais de uma hora recebia
// "JWT expired". Aqui a renovação é automática (timer + volta de aba +
// retry em 401) e o perfil (permissão de admin) é re-sincronizado com o
// servidor sem precisar sair e entrar de novo.
//
// Este módulo NÃO importa auth.js (evita import circular): avisa a
// interface por eventos na window:
//   sessao:perfil     -> perfil mudou no servidor ({ anterior, atual })
//   sessao:encerrada  -> sessão terminou ({ motivo: 'expirada' | 'saida' })
//   sessao:externa    -> outra aba entrou/saiu/renovou
import { state, config, salvarSessaoLocal } from './state.js';

const MARGEM_RENOVACAO_MS = 90_000;     // renova 90s antes de vencer
const INTERVALO_PERFIL_MS = 30_000;     // confere o perfil a cada 30s (aba visível)
const INTERVALO_MIN_SYNC_MS = 3_000;    // evita sync duplicado (focus + visibilitychange)
const RETRY_RENOVACAO_MS = 30_000;      // falha de rede: tenta de novo em 30s

export class ErroAuth extends Error {
    constructor(mensagem, status, codigo) {
        super(mensagem);
        this.name = 'ErroAuth';
        this.status = status;
        this.codigo = codigo;
    }
}

const emitir = (nome, detail = {}) => window.dispatchEvent(new CustomEvent(nome, { detail }));

// --- Chamadas à API de Auth (GoTrue) ---

export async function authFetch(caminho, options = {}) {
    const resposta = await fetch(`${config.SUPABASE_AUTH_BASE}${caminho}`, {
        ...options,
        headers: { apikey: config.SUPABASE_KEY, 'Content-Type': 'application/json', ...(options.headers || {}) }
    });
    const dados = await resposta.json().catch(() => null);
    if (!resposta.ok) {
        const msg = dados?.error_description || dados?.msg || dados?.message || dados?.error_code || dados?.error || `Erro ${resposta.status}`;
        throw new ErroAuth(msg, resposta.status, dados?.error_code || dados?.code || dados?.error);
    }
    return dados;
}

export function renovarSessaoAuth(refreshToken) {
    return authFetch('/token?grant_type=refresh_token', { method: 'POST', body: JSON.stringify({ refresh_token: refreshToken }) });
}

export async function buscarPerfilProprio(userId, tokenAcesso) {
    const resposta = await fetch(`${config.SUPABASE_URL}/${config.SUPABASE_TABLE_PERFIS}?select=*&id=eq.${encodeURIComponent(userId)}`, {
        headers: { apikey: config.SUPABASE_KEY, Authorization: `Bearer ${tokenAcesso}` }
    });
    if (!resposta.ok) throw new Error(`Supabase ${resposta.status}: ${await resposta.text()}`);
    const lista = await resposta.json();
    return Array.isArray(lista) && lista.length > 0 ? lista[0] : null;
}

// --- Estado da sessão ---

export function sessaoExpirada(margem = MARGEM_RENOVACAO_MS) {
    const s = state.sessaoAtual;
    return !s?.expires_at || Date.now() >= s.expires_at - margem;
}

export function encerrarSessaoLocal(motivo = 'saida') {
    clearTimeout(timerRenovacao);
    timerRenovacao = null;
    salvarSessaoLocal(null);
    emitir('sessao:encerrada', { motivo });
}

// Outra aba pode já ter renovado o token (o refresh_token é rotativo e
// compartilhado via localStorage): adota a sessão mais nova em vez de
// gastar o refresh_token de novo.
function adotarSessaoMaisNovaDoStorage() {
    try {
        const bruto = localStorage.getItem(config.CHAVE_SESSAO_LOCAL);
        const guardada = bruto ? JSON.parse(bruto) : null;
        if (guardada && guardada.expires_at > (state.sessaoAtual?.expires_at || 0)) {
            state.sessaoAtual = guardada;
            return true;
        }
    } catch (erro) { /* ignora JSON inválido */ }
    return false;
}

let timerRenovacao = null;
let renovacaoEmAndamento = null;

// Renova o access_token. Chamadas simultâneas compartilham a mesma
// requisição (o refresh_token só pode ser usado uma vez).
export function renovarSessao() {
    if (renovacaoEmAndamento) return renovacaoEmAndamento;

    renovacaoEmAndamento = (async () => {
        if (!state.sessaoAtual?.refresh_token) throw new ErroAuth('Sem sessão ativa.', 401, 'no_session');
        if (adotarSessaoMaisNovaDoStorage() && !sessaoExpirada()) { agendarRenovacao(); return state.sessaoAtual; }

        const refreshUsado = state.sessaoAtual.refresh_token;
        try {
            const r = await renovarSessaoAuth(refreshUsado);
            if (!state.sessaoAtual) throw new ErroAuth('Sessão encerrada durante a renovação.', 401, 'no_session');
            salvarSessaoLocal({
                ...state.sessaoAtual,
                access_token: r.access_token,
                refresh_token: r.refresh_token || refreshUsado,
                expires_at: Date.now() + (r.expires_in || 3600) * 1000,
                user: r.user || state.sessaoAtual.user
            });
            agendarRenovacao();
            return state.sessaoAtual;
        } catch (erro) {
            // refresh_token inválido/revogado = sessão perdida de verdade.
            // Falha de rede ou 5xx NÃO desloga: tenta de novo depois.
            if (erro instanceof ErroAuth && [400, 401, 403].includes(erro.status)) {
                if (adotarSessaoMaisNovaDoStorage() && !sessaoExpirada()) { agendarRenovacao(); return state.sessaoAtual; }
                if (state.sessaoAtual) encerrarSessaoLocal('expirada');
            }
            throw erro;
        }
    })().finally(() => { renovacaoEmAndamento = null; });

    return renovacaoEmAndamento;
}

function agendarRenovacao() {
    clearTimeout(timerRenovacao);
    timerRenovacao = null;
    const s = state.sessaoAtual;
    if (!s?.refresh_token || !s.expires_at) return;
    const espera = Math.max(5_000, s.expires_at - Date.now() - MARGEM_RENOVACAO_MS);
    timerRenovacao = setTimeout(async () => {
        try { await renovarSessao(); }
        catch (erro) {
            console.warn('Falha ao renovar sessão, nova tentativa em breve:', erro);
            if (state.sessaoAtual) timerRenovacao = setTimeout(() => agendarRenovacao(), RETRY_RENOVACAO_MS);
        }
    }, espera);
}

// Devolve um token utilizável agora: renova antes se estiver vencendo.
export async function obterTokenValido() {
    if (!state.sessaoAtual) return config.SUPABASE_KEY;
    if (sessaoExpirada()) {
        try { await renovarSessao(); } catch (erro) { /* segue com o que tiver; o retry em 401 cobre */ }
    }
    return state.sessaoAtual?.access_token || config.SUPABASE_KEY;
}

// fetch para PostgREST/Storage com token sempre fresco. Se o servidor
// responder 401 (JWT expired), renova e repete a requisição uma vez.
export async function fetchAutenticado(url, options = {}) {
    const enviar = (token) => fetch(url, {
        ...options,
        headers: { apikey: config.SUPABASE_KEY, ...(options.headers || {}), Authorization: `Bearer ${token}` }
    });

    let resposta = await enviar(await obterTokenValido());
    if (resposta.status === 401 && state.sessaoAtual?.refresh_token) {
        try {
            await renovarSessao();
            resposta = await enviar(state.sessaoAtual.access_token);
        } catch (erro) { /* mantém a resposta 401 original */ }
    }
    return resposta;
}

// --- Perfil (permissões) em tempo quase real ---

let sincronizandoPerfil = false;
let ultimoSync = 0;

export async function sincronizarPerfil({ forcar = false } = {}) {
    const s = state.sessaoAtual;
    if (!s?.user?.id || !state.supabaseAtivo || sincronizandoPerfil) return;
    if (!forcar && Date.now() - ultimoSync < INTERVALO_MIN_SYNC_MS) return;

    sincronizandoPerfil = true;
    ultimoSync = Date.now();
    try {
        const url = `${config.SUPABASE_URL}/${config.SUPABASE_TABLE_PERFIS}?select=*&id=eq.${encodeURIComponent(s.user.id)}`;
        const resposta = await fetchAutenticado(url);
        if (!resposta.ok) return;
        const perfil = (await resposta.json())?.[0];
        const atual = state.sessaoAtual;
        if (!perfil || !atual || atual.user?.id !== s.user.id) return;

        if (JSON.stringify(atual.perfil) !== JSON.stringify(perfil)) {
            const anterior = atual.perfil;
            salvarSessaoLocal({ ...atual, perfil });
            emitir('sessao:perfil', { anterior, atual: perfil });
        }
    } catch (erro) {
        console.warn('Não foi possível sincronizar o perfil:', erro);
    } finally {
        sincronizandoPerfil = false;
    }
}

// --- Monitoramento ---

let monitorando = false;

export function iniciarMonitoramentoSessao() {
    // Sempre (re)agenda a renovação: pode ter entrado uma sessão nova depois
    // que o monitoramento já estava ligado (ex.: login após abrir o app).
    agendarRenovacao();
    if (monitorando) return;
    monitorando = true;

    // Timers ficam congelados em aba em segundo plano: ao voltar, confere
    // o token na hora e já puxa o perfil atualizado.
    const aoVoltar = async () => {
        if (document.visibilityState !== 'visible' || !state.sessaoAtual) return;
        if (sessaoExpirada()) { try { await renovarSessao(); } catch (erro) { /* tratado dentro */ } }
        sincronizarPerfil();
    };
    document.addEventListener('visibilitychange', aoVoltar);
    window.addEventListener('focus', aoVoltar);
    window.addEventListener('online', aoVoltar);

    setInterval(() => {
        if (document.visibilityState === 'visible' && state.sessaoAtual) sincronizarPerfil();
    }, INTERVALO_PERFIL_MS);

    // Login/logout/renovação feitos em outra aba refletem aqui.
    window.addEventListener('storage', (e) => {
        if (e.key !== config.CHAVE_SESSAO_LOCAL) return;
        try { state.sessaoAtual = e.newValue ? JSON.parse(e.newValue) : null; }
        catch (erro) { state.sessaoAtual = null; }
        agendarRenovacao();
        emitir('sessao:externa');
    });
}
