// =========================================================
// --- UTILITÁRIOS COMPARTILHADOS ---
// =========================================================
// Escapa texto antes de ir para innerHTML (evita XSS: texto digitado pelo
// usuário nunca vira HTML/script). Use em TODO dado vindo do banco.
const ENTIDADES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export function esc(valor: unknown): string {
    return String(valor ?? '').replace(/[&<>"']/g, c => ENTIDADES[c]);
}

const STATUS: Record<string, string> = { inspecao: 'Inspeção', nao_reparado: 'Não Reparado', em_andamento: 'Andamento', concluido: 'Concluído' };
export function formatarStatus(s: string): string {
    return STATUS[s] || s;
}

// "aaaa-mm-dd" -> "dd/mm/aaaa"
export function formatarDataBR(d: string | null | undefined): string {
    if (!d) return '-';
    const p = d.split('-');
    return `${p[2]}/${p[1]}/${p[0]}`;
}

// Define o valor de um <select> tentando primeiro a correspondência
// exata e, se não achar, ignorando maiúsculas/minúsculas — protege
// contra registros antigos que foram salvos em CAIXA ALTA e não batem
// mais com o texto exato das opções (ex: "SOLE FLUE 1" x "Sole Flue 1").
export function definirValorSelect(selectEl: HTMLSelectElement | null, valor: string | null | undefined): void {
    if (!selectEl || valor === undefined || valor === null) return;
    const opcaoExata = Array.from(selectEl.options).find(o => o.value === valor);
    if (opcaoExata) { selectEl.value = opcaoExata.value; return; }
    const opcaoIgnorandoCase = Array.from(selectEl.options).find(o => o.value.toLowerCase() === String(valor).toLowerCase());
    selectEl.value = opcaoIgnorandoCase ? opcaoIgnorandoCase.value : valor;
}

export interface SituacaoPrazo {
    codigo: 'sem_prazo' | 'concluido_atrasado' | 'concluido_no_prazo' | 'atrasado' | 'no_prazo';
    texto: string;
    classe: 'prazo_neutro' | 'prazo_atrasado' | 'prazo_ok';
}

// Situação de prazo de um reparo (atrasado, no prazo, etc), usada tanto na
// tabela geral (coluna "Situação") quanto na impressão da tabela.
export function calcularSituacaoPrazo(reg: { prazo?: string | null; data_fim?: string | null; andamento?: string }): SituacaoPrazo {
    if (!reg.prazo) return { codigo: 'sem_prazo', texto: 'Sem Prazo', classe: 'prazo_neutro' };

    const dataHoje = new Date().toISOString().split('T')[0];
    if (reg.andamento === 'concluido') {
        if (reg.data_fim && reg.data_fim > reg.prazo) return { codigo: 'concluido_atrasado', texto: 'Concluído Atrasado', classe: 'prazo_atrasado' };
        return { codigo: 'concluido_no_prazo', texto: 'Concluído no Prazo', classe: 'prazo_ok' };
    }
    if (dataHoje > reg.prazo) return { codigo: 'atrasado', texto: 'Atrasado', classe: 'prazo_atrasado' };
    return { codigo: 'no_prazo', texto: 'No Prazo', classe: 'prazo_ok' };
}

// Espera a digitação parar por `espera` ms antes de rodar `fn` — evita
// refazer a tabela inteira a cada tecla digitada num filtro de texto.
export function debounce<A extends unknown[]>(fn: (...args: A) => void, espera = 300): (...args: A) => void {
    let idTimeout: ReturnType<typeof setTimeout> | undefined;
    return (...args: A) => {
        clearTimeout(idTimeout);
        idTimeout = setTimeout(() => fn(...args), espera);
    };
}
