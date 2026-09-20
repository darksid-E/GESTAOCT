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
    avaliacao_ct: string;
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
    nome: string;
    sobrenome: string;
    isAdmin: boolean;
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
