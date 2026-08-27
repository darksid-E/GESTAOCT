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
