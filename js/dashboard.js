// =========================================================
// --- 6. DASHBOARD GRÁFICOS (CHART.JS) ---
// =========================================================
import { state, isAdminAtual, salvarCacheLocal } from './state.js';
import { importarReparosSupabase } from './supabase-api.js';
import { processarDadosGlobais } from './mapa2d.js';
import { renderizarTabela } from './tabela.js';

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

export function initDashboard() {
    document.getElementById('dash_filtro_bat').addEventListener('change', renderizarDashboard);

    document.getElementById("btn_exportar_json").addEventListener("click", () => {
        if (state.dbReparos.length === 0) return alert("Banco vazio!");
        const a = document.createElement('a'); a.href = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(state.dbReparos, null, 4));
        a.download = `db_reparos_${new Date().getTime()}.json`; a.click();
    });
    document.getElementById("btn_trigger_import").addEventListener("click", () => document.getElementById("btn_importar_json").click());
    document.getElementById("btn_importar_json").addEventListener("change", (e) => {
        if (!isAdminAtual()) { alert('Apenas usuários administradores podem carregar um banco de dados.'); e.target.value = ''; return; }
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
                alert(`${state.dbReparos.length} registro(s) carregado(s)!`);
            } catch (err) {
                console.error('Erro ao importar JSON:', err);
                alert(`Erro no JSON ou no Supabase.\n${err.message}`);
            } finally {
                e.target.value = '';
            }
        }; reader.readAsText(file);
    });
}
