import type { Reparo, SessaoAuth } from './types.js';

// =========================================================
// --- ESTADO COMPARTILHADO ---
// =========================================================
// Tudo que era variável solta dentro do único DOMContentLoaded do
// script.js original e precisava ser lida/alterada por vários trechos
// de código agora mora aqui, em um objeto único. Os outros módulos
// importam `state` e leem/escrevem em `state.algumaCoisa` em vez de usar
// uma variável de closure compartilhada.

const SUPABASE_URL = window.SUPABASE_CONFIG?.url || '';
const SUPABASE_KEY = window.SUPABASE_CONFIG?.key || '';
// A URL de config aponta para /rest/v1 (usada pelo PostgREST). O Storage
// vive na raiz do projeto (/storage/v1/...), então removemos o sufixo
// /rest/v1 para montar a URL correta e evitar o erro PGRST125 (o
// PostgREST tentava interpretar "storage" como parte da rota REST).
const SUPABASE_STORAGE_BASE = SUPABASE_URL.replace(/\/rest\/v1\/?$/, '');
const SUPABASE_TABLE = 'reparos';
const SUPABASE_AUTH_BASE = `${SUPABASE_STORAGE_BASE}/auth/v1`;
const SUPABASE_TABLE_PERFIS = 'perfis';
const CHAVE_SESSAO_LOCAL = 'sessaoAuthCT';

// Abas que só podem ser vistas depois de logar. "cadastro" é a tela de
// login/cadastro em si, então fica sempre acessível.
const ABAS_LIVRES_SEM_LOGIN = ['cadastro'];

function carregarSessaoLocal(): SessaoAuth | null {
    try {
        const bruto = localStorage.getItem(CHAVE_SESSAO_LOCAL);
        return bruto ? (JSON.parse(bruto) as SessaoAuth) : null;
    } catch (erro) {
        return null;
    }
}

interface EstadoApp {
    supabaseAtivo: boolean;
    dbReparos: Reparo[];
    sessaoAtual: SessaoAuth | null;
    // Dados de temperatura buscados ao vivo do PI Web API (resposta
    // crua de /api/pi-temperaturas) — nunca vão pro Supabase.
    dadosTemperaturaPI: unknown | null;
    periodoTempInicio: number | null; // epoch ms
    periodoTempFim: number | null;    // epoch ms
    ordenacaoTemp: { coluna: string | null; direcao: 'asc' | 'desc' };
    intervaloAtualizacaoTemp: ReturnType<typeof setInterval> | null;
    charts: {
        temperaturaGeral: unknown | null;
        dashboardStatus: unknown | null;
        dashboardRetro: unknown | null;
    };
    three: {
        scene: unknown | null;
        camera: unknown | null;
        renderer: unknown | null;
        controls: unknown | null;
        fornosGroup: unknown | null;
    };
    filtroAtivoLegenda: string | null;

    // Bateria selecionada no seletor da aba "Gestão de Reparos" — só afeta
    // a contagem dos cards de resumo (Inspeção/Não Reparado/Andamento/
    // Concluído), o mapa em si continua mostrando as 3 baterias sempre.
    filtroBateriaReparos: string;
}

export const state: EstadoApp = {
    supabaseAtivo: Boolean(SUPABASE_URL && SUPABASE_KEY),
    dbReparos: [],

    // { access_token, refresh_token, expires_at, user, perfil }
    sessaoAtual: carregarSessaoLocal(),

    // Dados de temperatura (buscados ao vivo do PI Web API, só em
    // memória — nunca vão pro Supabase)
    dadosTemperaturaPI: null,
    periodoTempInicio: null,
    periodoTempFim: null,
    ordenacaoTemp: { coluna: null, direcao: 'asc' },
    intervaloAtualizacaoTemp: null,

    // Instâncias de gráficos Chart.js
    charts: {
        temperaturaGeral: null,
        dashboardStatus: null,
        dashboardRetro: null,
    },

    // Cena 3D (gêmeo digital)
    three: {
        scene: null,
        camera: null,
        renderer: null,
        controls: null,
        fornosGroup: null,
    },

    // Filtro ativo na legenda do mapa 2D
    filtroAtivoLegenda: null,

    // Bateria selecionada no seletor da aba "Gestão de Reparos" — só afeta
    // a contagem dos cards de resumo (Inspeção/Não Reparado/Andamento/
    // Concluído), o mapa em si continua mostrando as 3 baterias sempre.
    filtroBateriaReparos: 'Todas',
};

export const config = {
    SUPABASE_URL,
    SUPABASE_KEY,
    SUPABASE_STORAGE_BASE,
    SUPABASE_TABLE,
    SUPABASE_AUTH_BASE,
    SUPABASE_TABLE_PERFIS,
    CHAVE_SESSAO_LOCAL,
    ABAS_LIVRES_SEM_LOGIN,
};

export function salvarSessaoLocal(sessao: SessaoAuth | null): void {
    state.sessaoAtual = sessao;
    if (sessao) localStorage.setItem(CHAVE_SESSAO_LOCAL, JSON.stringify(sessao));
    else localStorage.removeItem(CHAVE_SESSAO_LOCAL);
}

// Token usado em toda requisição ao Supabase: o do usuário logado (assim
// as políticas RLS conseguem checar auth.uid()), ou a chave anônima
// pública para quem só está navegando/consultando sem estar logado.
export function tokenAtual(): string {
    return state.sessaoAtual?.access_token || SUPABASE_KEY;
}

export function isAdminAtual(): boolean {
    return !!(state.sessaoAtual?.perfil?.isAdmin === true);
}

export function nomeExibicaoAtual(): string {
    const p = state.sessaoAtual?.perfil;
    if (p) return `${p.nome} ${p.sobrenome}`.trim();
    return state.sessaoAtual?.user?.email || 'Usuário desconhecido';
}

export function carregarCacheLocal(): Reparo[] {
    try {
        const baseLocal = (JSON.parse(localStorage.getItem('dbReparosCoke') || '[]') as Reparo[]) || [];
        return baseLocal.map(r =>
            r.id_reparo
                ? r
                : { ...r, id_reparo: Date.now().toString() + Math.floor(Math.random() * 100000).toString() }
        );
    } catch (erro) {
        console.warn('Não foi possível ler o cache local:', erro);
        return [];
    }
}

export function salvarCacheLocal(): void {
    localStorage.setItem('dbReparosCoke', JSON.stringify(state.dbReparos));
}
