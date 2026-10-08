// =========================================================
// --- 6. DASHBOARD GRÁFICOS (CHART.JS) ---
// =========================================================
import { state, isAdminAtual, salvarCacheLocal } from './state.js';
import { importarReparosSupabase } from './supabase-api.js';
import { processarDadosGlobais } from './mapa2d.js';
import { renderizarTabela } from './tabela.js';
import { formatarStatus, formatarDataBR, calcularSituacaoPrazo } from './utils.js';

import { mostrarToast } from './toast.js';
export function renderizarDashboard() {
    const batFilter = document.getElementById('dash_filtro_bat').value;
    let baseReparos = batFilter === 'Todas' ? state.dbReparos : state.dbReparos.filter(r => r.bateria === batFilter);

    let ultimosStatus = {};
    baseReparos.forEach(r => { ultimosStatus[r.id_referencia] = r.andamento; });

    let cStatus = { inspecao: 0, nao_reparado: 0, em_andamento: 0, concluido: 0 };
    for (let id in ultimosStatus) { if (cStatus[ultimosStatus[id]] !== undefined) cStatus[ultimosStatus[id]]++; }

    if (state.charts.dashboardStatus) state.charts.dashboardStatus.destroy();
    state.charts.dashboardStatus = new Chart(document.getElementById('graficoStatus'), {
        type: 'doughnut',
        data: {
            labels: ['Inspeção', 'Não Reparado', 'Em Andamento', 'Concluído'],
            datasets: [{ data: [cStatus.inspecao, cStatus.nao_reparado, cStatus.em_andamento, cStatus.concluido], backgroundColor: ['#FFD700', '#FF4C4C', '#1E90FF', '#32CD32'] }]
        },
        options: { responsive: true, plugins: { legend: { position: 'bottom' } } }
    });

    let contagemPecas = {};
    baseReparos.forEach(r => {
        contagemPecas[r.id_referencia] = (contagemPecas[r.id_referencia] || 0) + 1;
    });

    let retroativos = 0;
    let registrosUnicos = 0;
    for (let id in contagemPecas) {
        if (contagemPecas[id] > 1) retroativos++;
        else registrosUnicos++;
    }

    if (state.charts.dashboardRetro) state.charts.dashboardRetro.destroy();
    state.charts.dashboardRetro = new Chart(document.getElementById('graficoRetroativos'), {
        type: 'doughnut',
        data: {
            labels: ['Lançamento Único (OK)', 'Retroativo (>1 Lançamento)'],
            datasets: [{ data: [registrosUnicos, retroativos], backgroundColor: ['#A0A0A0', '#E13300'] }]
        },
        options: { responsive: true, plugins: { legend: { position: 'bottom' } } }
    });
}

// Exporta TODOS os reparos para Excel, com cabeçalhos e dados em MAIÚSCULO.
// Links das fotos não são convertidos (maiúsculas quebrariam a URL): saem
// como células "VER FOTO" com hiperlink para o endereço original.
function exportarExcelReparos() {
    if (typeof XLSX === 'undefined') {
        mostrarToast('A biblioteca de exportação (SheetJS) não carregou. Verifique sua conexão e tente de novo.', 'erro', 8000);
        return;
    }
    if (state.dbReparos.length === 0) return mostrarToast('Banco vazio!', 'info', 6000);

    const maiusculo = (v) => (v === null || v === undefined || v === '') ? '' : String(v).toUpperCase();
    const dataBR = (v) => v ? formatarDataBR(v) : '';

    const colunas = [
        'DATA LANÇAMENTO', 'DATA OCORRÊNCIA', 'ID ALVO', 'BATERIA', 'BLOCO', 'FORNO', 'LADO', 'ELEMENTO',
        'PROBLEMA', 'SOLUÇÃO', 'STATUS', 'RANKING', 'AVALIAÇÃO CT', 'AVALIADOR CT', 'PRAZO', 'DATA FIM',
        'SITUAÇÃO', 'OBSERVAÇÃO', 'REGISTRADO POR', 'FOTO ANTES', 'FOTO DEPOIS'
    ];

    const linhas = state.dbReparos.map(r => [
        maiusculo(r.data_registro), dataBR(r.data_ocorrencia), maiusculo(r.id_referencia), maiusculo(r.bateria),
        maiusculo(r.bloco), maiusculo(r.forno), maiusculo(r.lado), maiusculo(r.reparo_no),
        maiusculo(r.desc_problema), maiusculo(r.desc_solucao), maiusculo(formatarStatus(r.andamento)),
        r.ranking_problema || '', maiusculo(r.avaliacao_ct), maiusculo(r.avaliador_ct),
        dataBR(r.prazo), dataBR(r.data_fim), maiusculo(calcularSituacaoPrazo(r).texto),
        maiusculo(r.observacao), maiusculo(r.criado_por),
        r.foto_antes ? 'VER FOTO' : '', r.foto_depois ? 'VER FOTO' : ''
    ]);

    const planilha = XLSX.utils.aoa_to_sheet([colunas, ...linhas]);

    // Hiperlinks das fotos (colunas T e U) apontando para a URL original
    const colAntes = colunas.indexOf('FOTO ANTES');
    const colDepois = colunas.indexOf('FOTO DEPOIS');
    state.dbReparos.forEach((r, i) => {
        const linha = i + 1; // linha 0 é o cabeçalho
        [[colAntes, r.foto_antes], [colDepois, r.foto_depois]].forEach(([col, url]) => {
            if (!url) return;
            const celula = planilha[XLSX.utils.encode_cell({ r: linha, c: col })];
            if (celula) celula.l = { Target: url };
        });
    });

    planilha['!cols'] = colunas.map((nome, c) => {
        const maior = Math.max(nome.length, ...linhas.map(l => String(l[c] ?? '').length));
        return { wch: Math.min(Math.max(maior + 2, 10), 50) };
    });
    planilha['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: linhas.length, c: colunas.length - 1 } }) };

    const livro = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(livro, planilha, 'REPAROS');
    const hoje = new Date();
    const carimbo = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-${String(hoje.getDate()).padStart(2, '0')}`;
    XLSX.writeFile(livro, `REPAROS_COQUERIA_${carimbo}.xlsx`);
}

export function initDashboard() {
    document.getElementById('dash_filtro_bat').addEventListener('change', renderizarDashboard);

    document.getElementById("btn_baixar_excel_reparos").addEventListener("click", exportarExcelReparos);
    document.getElementById("btn_trigger_import")?.addEventListener("click", () => document.getElementById("btn_importar_json").click());
    document.getElementById("btn_importar_json").addEventListener("change", (e) => {
        if (!isAdminAtual()) { mostrarToast('Apenas usuários administradores podem carregar um banco de dados.', 'info', 6000); e.target.value = ''; return; }
        const file = e.target.files[0]; if (!file) return; const reader = new FileReader();
        reader.onload = async (evt) => {
            try {
                const registros = JSON.parse(evt.target.result);
                if (!Array.isArray(registros)) throw new Error('O JSON precisa conter uma lista de registros.');

                if (state.supabaseAtivo) {
                    state.dbReparos = await importarReparosSupabase(registros);
                } else {
                    state.dbReparos = registros;
                }

                salvarCacheLocal();
                processarDadosGlobais();
                renderizarTabela();
                mostrarToast(`${state.dbReparos.length} registro(s) carregado(s)!`, 'sucesso', 5000);
            } catch (err) {
                console.error('Erro ao importar JSON:', err);
                mostrarToast(`Erro no JSON ou no Supabase.\n${err.message}`, 'erro', 8000);
            } finally {
                e.target.value = '';
            }
        }; reader.readAsText(file);
    });
}
