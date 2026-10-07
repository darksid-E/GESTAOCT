// =========================================================
// --- TIPOS DE DOMÍNIO COMPARTILHADOS ---
// =========================================================
// Extraídos do formato real gravado pelo modal-reparo.js e lido pela
// tabela/mapa/impressão. Campos vindos do formulário HTML chegam como
// string (inclusive datas, que o app já trata como string dd/mm/aaaa ou
// vazia), por isso a tipagem aqui reflete o dado bruto, não um ideal.

export type StatusReparo =
    | 'inspecao'
    | 'aguardando'
    | 'em_andamento'
    | 'concluido'
    | (string & {}); // outras fases já podem existir no banco; não travar

export interface Reparo {
    id_reparo: string;
    data_registro?: string;       // dd/mm/aaaa, gerado no toLocaleDateString('pt-BR')
    criado_por?: string;
    bateria: string;
    bloco: string;
    forno: string;
    lado: string;
    reparo_no: string;
    id_referencia: string;
    desc_problema: string;
    desc_solucao: string;
    andamento: StatusReparo;
    prazo: string | null;
    data_fim: string | null;
    avaliacao_ct: string;         // 'OK' | 'NOK' (registros antigos podem ter texto livre)
    avaliador_ct?: string;        // nome de quem fez a avaliação CT
    ranking_problema?: number | null; // 1 a 5
    data_ocorrencia?: string | null;  // yyyy-mm-dd, quando o problema ocorreu (≠ data_registro)
    observacao: string;
    foto_antes: string | null;
    foto_depois: string | null;
}

// Lançamento de altura/perfil de carga das máquinas de carregamento
// (31/32) por forno — tabela "maquinas" no Supabase. altura_media,
// desvio e gatilho são calculados por trigger no banco (não preencher
// no INSERT); id também é gerado pelo Postgres.
export interface Maquina {
    id?: number;
    data: string;               // yyyy-mm-dd (input type="date")
    bateria: string;            // 'A' | 'B' | 'C'
    bloco: number;
    forno: number;
    maquina: string;            // '31A' | '32A' | '31B' | '32B' | '31C' | '32C'
    altura_programada: number;
    perfil_carga: string;
    frontal_dir: number;
    frontal_esq: number;
    centro_dir: number;
    centro_1_dir_esq: number;
    centro_esq: number;
    centro_2_dir_esq: number;
    traseira_dir: number;
    traseira_esq: number;
    tempo_compactacao_min: number;
    pressao_compactacao_bar: number;
    nivel_oleo_pct: number;
    nivel_bacia_pct: number;
    observacao: string;
    altura_media?: number;
    desvio?: number;
    gatilho?: 'OK' | 'DESVIO' | (string & {});
    registrado_por?: string;
    criado_em?: string;
}

export interface Perfil {
    id?: string;
    nome: string;
    sobrenome: string;
    matricula?: string;
    email?: string | null;
    isAdmin: boolean;
    isDev?: boolean;                  // desenvolvedor: o isAdmin dele só muda direto no Supabase
    cadastrado_em?: string | null;
    // Visibilidade por página: colunas ver_<pagina> (padrão true no banco)
    [coluna: `ver_${string}`]: boolean | undefined;
}

export interface SessaoAuth {
    access_token: string;
    refresh_token: string;
    expires_at: number;
    user: { email: string; [key: string]: unknown };
    perfil?: Perfil;
}

export interface SupabaseConfigWindow {
    url: string;
    key: string;
}

declare global {
    interface Window {
        SUPABASE_CONFIG?: SupabaseConfigWindow;
    }
}

// --- Relatório de passagem de turno ---
// Catálogo de itens (tabela relatorio_turno_itens, vinda da aba INDICADORES).
export interface RelatorioItem {
    id: number;
    setor: 'CONTROLE_TERMICO' | 'CALDEIRAS' | 'MAQUINAS' | 'FGDS';
    equipamento: string | null;     // '31A', 'A1'... (null = card inteiro)
    item: string;
    unidade: string | null;
    parametro: string | null;       // texto exibido no card
    entrada: 'NUMERO' | 'STATUS' | 'NUMERO_STATUS';
    meta_min: number | null;
    min_inclusivo: boolean;
    meta_max: number | null;
    max_inclusivo: boolean;
    bateria: string | null;         // null = vale pras 3 baterias
    fonte_auto: 'MAQUINA_PRESSAO' | 'MAQUINA_DESVIO' | null;
    ordem: number;
    ativo: boolean;
}

// Uma linha por item lançado (tabela relatorio_turno). setor/meta/parametro
// e o status OK/NOK (quando há meta numérica) são preenchidos pela trigger.
export interface RelatorioRegistro {
    id?: number;
    lote_id?: string;
    data: string;                   // yyyy-mm-dd
    bateria: string;                // 'A' | 'B' | 'C'
    setor?: string;
    equipamento?: string | null;
    tipo: 'ADM' | 'TURNO';
    item_id: number;
    valor: number | null;
    parametro?: string | null;
    meta_min?: number | null;
    min_inclusivo?: boolean;
    meta_max?: number | null;
    max_inclusivo?: boolean;
    status: 'OK' | 'NOK' | null;
    justificativa: string | null;
    observacao: string | null;
    origem?: 'MANUAL' | 'AUTO';
    registrado_por?: string;
    criado_em?: string;
    atualizado_em?: string;
}
