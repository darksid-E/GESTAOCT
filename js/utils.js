// =========================================================
// --- UTILITÁRIOS COMPARTILHADOS ---
// =========================================================
export function formatarStatus(s) {
    const m = { 'inspecao': 'Inspeção', 'nao_reparado': 'Não Reparado', 'em_andamento': 'Andamento', 'concluido': 'Concluído' };
    return m[s] || s;
}

export function formatarDataBR(d) {
    if (!d) return '-';
    const p = d.split('-');
    return `${p[2]}/${p[1]}/${p[0]}`;
}

// Define o valor de um <select> tentando primeiro a correspondência
// exata e, se não achar, ignorando maiúsculas/minúsculas — protege
// contra registros antigos que foram salvos em CAIXA ALTA e não batem
// mais com o texto exato das opções (ex: "SOLE FLUE 1" x "Sole Flue 1").
export function definirValorSelect(selectEl, valor) {
    if (!selectEl || valor === undefined || valor === null) return;
    const opcaoExata = Array.from(selectEl.options).find(o => o.value === valor);
    if (opcaoExata) { selectEl.value = opcaoExata.value; return; }
    const opcaoIgnorandoCase = Array.from(selectEl.options).find(o => o.value.toLowerCase() === String(valor).toLowerCase());
    selectEl.value = opcaoIgnorandoCase ? opcaoIgnorandoCase.value : valor;
}
