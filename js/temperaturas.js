// =========================================================
// --- GRÁFICO DE TEMPERATURAS (ao vivo, via PI Web API) ---
// =========================================================
// Busca direto do PI System a cada 5 minutos (mesma resolução das
// medições). Nada é salvo no Supabase — os dados só existem em
// memória enquanto essa aba estiver aberta no navegador.
import { state } from './state.js';
import { formatarDataBR } from './utils.js';
import { buscarDadosPI } from './pi-api.js';

const INTERVALO_ATUALIZACAO_MS = 5 * 60 * 1000; // 5 minutos, mesma resolução do PI

const SERIES = [
    { chave: 'TOPO', label: 'TOPO TEMP.', cor: 'black' },
    { chave: 'LC', label: 'LC TEMP. (Coke Side)', cor: 'darkblue' },
    { chave: 'LM', label: 'LM TEMP. (Machine Side)', cor: 'red' },
];

function paraInputData(ms) {
    const d = new Date(ms);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
}

// Período padrão: últimas 2 semanas até agora.
function definirPeriodoPadrao() {
    const agora = Date.now();
    const DUAS_SEMANAS_MS = 14 * 24 * 60 * 60 * 1000;
    state.periodoTempFim = agora;
    state.periodoTempInicio = agora - DUAS_SEMANAS_MS;
    sincronizarInputsPeriodo();
}

function sincronizarInputsPeriodo() {
    if (state.periodoTempInicio === null || state.periodoTempFim === null) return;
    const elIni = document.getElementById('temp_periodo_inicio');
    if (elIni) elIni.value = paraInputData(state.periodoTempInicio);
    const elFim = document.getElementById('temp_periodo_fim');
    if (elFim) elFim.value = paraInputData(state.periodoTempFim);
}

function aoMudarPeriodo() {
    const ini = document.getElementById('temp_periodo_inicio')?.value;
    const fim = document.getElementById('temp_periodo_fim')?.value;
    if (ini) state.periodoTempInicio = new Date(`${ini}T00:00:00`).getTime();
    if (fim) state.periodoTempFim = new Date(`${fim}T23:59:59`).getTime();
    sincronizarInputsPeriodo();
    renderizarGraficoTemperaturaTab();
}

function formatarDataHoraCurta(isoStr) {
    const d = new Date(isoStr);
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const hh = String(d.getHours()).padStart(2, '0');
    const min = String(d.getMinutes()).padStart(2, '0');
    return `${dd}/${mm} ${hh}:${min}`;
}

// Plugin do Chart.js que desenha uma linha vertical tracejada em cada
// data de conclusão de reparo daquele forno, com um rótulo ao lado.
const pluginLinhasReparo = {
    id: 'linhasReparo',
    afterDraw(chart, args, opts) {
        const indices = opts?.indices || [];
        if (!indices.length) return;
        const { ctx, chartArea, scales } = chart;
        if (!chartArea || !scales.x) return;
        ctx.save();
        indices.forEach(({ index, label }) => {
            const xPos = scales.x.getPixelForValue(index);
            if (xPos < chartArea.left || xPos > chartArea.right) return;
            ctx.strokeStyle = 'rgba(142, 36, 170, 0.85)';
            ctx.lineWidth = 2;
            ctx.setLineDash([6, 4]);
            ctx.beginPath();
            ctx.moveTo(xPos, chartArea.top);
            ctx.lineTo(xPos, chartArea.bottom);
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.fillStyle = '#8e24aa';
            ctx.font = 'bold 9px Arial';
            ctx.save();
            ctx.translate(xPos - 4, chartArea.top + 4);
            ctx.rotate(Math.PI / 2);
            ctx.textBaseline = 'bottom';
            ctx.fillText(label, 0, 0);
            ctx.restore();
        });
        ctx.restore();
    }
};
if (typeof Chart !== 'undefined' && typeof Chart.register === 'function') Chart.register(pluginLinhasReparo);

function montarConfigGraficoTemperatura(dados, bateria, bloco, forno) {
    const pontosTopo = dados.dados.TOPO?.pontos || [];
    const labels = pontosTopo.map(p => formatarDataHoraCurta(p.t));

    const reparosConcluidos = state.dbReparos.filter(r =>
        r.bateria === bateria && r.bloco === bloco && r.forno === forno &&
        r.andamento === 'concluido' && r.data_fim
    );
    const indicesConclusao = [];
    reparosConcluidos.forEach(rep => {
        const alvoMs = new Date(`${rep.data_fim}T12:00:00`).getTime();
        if (isNaN(alvoMs)) return;
        let melhorIndex = -1, melhorDist = Infinity;
        pontosTopo.forEach((p, i) => {
            const dist = Math.abs(new Date(p.t).getTime() - alvoMs);
            if (dist < melhorDist) { melhorDist = dist; melhorIndex = i; }
        });
        if (melhorIndex !== -1 && melhorDist <= 2 * 24 * 60 * 60 * 1000) {
            indicesConclusao.push({ index: melhorIndex, label: `Reparo concluído: ${formatarDataBR(rep.data_fim)}` });
        }
    });

    const datasets = SERIES.map(s => ({
        label: s.label,
        data: (dados.dados[s.chave]?.pontos || []).map(p => p.v),
        borderColor: s.cor,
        backgroundColor: s.cor,
        yAxisID: 'yTemp',
        tension: 0.15,
        pointRadius: 0,
        borderWidth: 1.6,
        spanGaps: true,
    }));

    return {
        type: 'line',
        data: { labels, datasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: { position: 'bottom', labels: { boxWidth: 14, font: { size: 10 } } },
                linhasReparo: { indices: indicesConclusao },
                zoom: {
                    zoom: {
                        drag: { enabled: true, backgroundColor: 'rgba(225,51,0,0.15)', borderColor: 'rgba(225,51,0,0.6)', borderWidth: 1 },
                        mode: 'x',
                    },
                    limits: { x: { minRange: 5 } }
                }
            },
            scales: {
                x: { ticks: { maxTicksLimit: 10, autoSkip: true, font: { size: 9 } } },
                yTemp: { type: 'linear', position: 'left', title: { display: true, text: 'Temperatura (°C)', font: { size: 10 } } }
            }
        }
    };
}

function renderizarIndicadores(dados) {
    const container = document.getElementById('temp_indicadores');
    if (!container) return;

    if (!dados) { container.innerHTML = ''; return; }

    container.innerHTML = SERIES.map(s => {
        const ind = dados.dados[s.chave]?.indicadores || { min: null, max: null, media: null };
        const fmt = (v) => v === null || v === undefined ? '—' : `${v.toFixed(1)}°C`;
        return `
            <div class="temp_card_indicador" style="border-left: 4px solid ${s.cor};">
                <span class="temp_card_titulo">${s.label}</span>
                <div class="temp_card_valores">
                    <div><span class="temp_card_label">Mín.</span><span>${fmt(ind.min)}</span></div>
                    <div><span class="temp_card_label">Média</span><span>${fmt(ind.media)}</span></div>
                    <div><span class="temp_card_label">Máx.</span><span>${fmt(ind.max)}</span></div>
                </div>
            </div>
        `;
    }).join('');
}

// Monta a tabela de leituras (uma linha por timestamp), com colunas
// clicáveis pra ordenar crescente/decrescente por qualquer série.
function renderizarTabelaLeituras(dados) {
    const container = document.getElementById('temp_tabela_leituras');
    if (!container) return;
    if (!dados) { container.innerHTML = ''; return; }

    const pontosTopo = dados.dados.TOPO?.pontos || [];
    const linhas = pontosTopo.map((p, i) => ({
        t: p.t,
        TOPO: p.v,
        LC: dados.dados.LC?.pontos?.[i]?.v ?? null,
        LM: dados.dados.LM?.pontos?.[i]?.v ?? null,
    }));

    const { coluna, direcao } = state.ordenacaoTemp;
    if (coluna) {
        linhas.sort((a, b) => {
            const va = a[coluna], vb = b[coluna];
            if (va === null) return 1;
            if (vb === null) return -1;
            return direcao === 'asc' ? va - vb : vb - va;
        });
    }

    const setaColuna = (col) => coluna === col ? (direcao === 'asc' ? ' ▲' : ' ▼') : '';

    const linhasHtml = linhas.slice(0, 500).map(l => `
        <tr>
            <td>${formatarDataHoraCurta(l.t)}</td>
            <td>${l.TOPO !== null ? l.TOPO.toFixed(1) : '—'}</td>
            <td>${l.LC !== null ? l.LC.toFixed(1) : '—'}</td>
            <td>${l.LM !== null ? l.LM.toFixed(1) : '—'}</td>
        </tr>
    `).join('');

    container.innerHTML = `
        <table class="temp_tabela">
            <thead>
                <tr>
                    <th data-col="t">Data/Hora</th>
                    <th data-col="TOPO" class="ordenavel">TOPO${setaColuna('TOPO')}</th>
                    <th data-col="LC" class="ordenavel">LC${setaColuna('LC')}</th>
                    <th data-col="LM" class="ordenavel">LM${setaColuna('LM')}</th>
                </tr>
            </thead>
            <tbody>${linhasHtml}</tbody>
        </table>
        ${linhas.length > 500 ? `<p class="temp_hint">Mostrando as primeiras 500 de ${linhas.length} leituras. Reduza o período pra ver todas.</p>` : ''}
    `;

    container.querySelectorAll('th.ordenavel').forEach(th => {
        th.addEventListener('click', () => {
            const col = th.dataset.col;
            if (state.ordenacaoTemp.coluna === col) {
                state.ordenacaoTemp.direcao = state.ordenacaoTemp.direcao === 'asc' ? 'desc' : 'asc';
            } else {
                state.ordenacaoTemp = { coluna: col, direcao: 'asc' };
            }
            renderizarTabelaLeituras(state.dadosTemperaturaPI);
        });
    });
}

function atualizarStatusFonte(carregando, erro) {
    const el = document.getElementById('status_fonte_temp');
    if (!el) return;
    if (erro) { el.innerText = `⚠️ ${erro}`; return; }
    if (carregando) { el.innerText = '🔄 Buscando dados no PI System...'; return; }
    const agora = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    el.innerText = `🟢 Ao vivo — última atualização: ${agora} (atualiza a cada 5 min)`;
}

export async function renderizarGraficoTemperaturaTab() {
    const bat = document.getElementById('temp_filtro_bat')?.value;
    const bloco = document.getElementById('temp_filtro_bloco')?.value;
    const forno = document.getElementById('temp_filtro_forno')?.value;
    if (!bat || !bloco || !forno) return;
    if (state.periodoTempInicio === null || state.periodoTempFim === null) definirPeriodoPadrao();

    const canvas = document.getElementById('grafico_temperatura_geral');
    const semDados = document.getElementById('temp_sem_dados_geral');

    atualizarStatusFonte(true, null);
    const resposta = await buscarDadosPI(bat, bloco, forno, state.periodoTempInicio, state.periodoTempFim);

    if (resposta?.indisponivel) {
        state.dadosTemperaturaPI = null;
        atualizarStatusFonte(false, 'Indisponível fora da rede/VPN da Ternium. Conecte-se e tente de novo.');
        canvas.style.display = 'none';
        if (semDados) { semDados.innerText = 'Não foi possível falar com o PI System — você está na rede/VPN da Ternium?'; semDados.style.display = 'block'; }
        renderizarIndicadores(null);
        renderizarTabelaLeituras(null);
        return;
    }

    const dados = resposta;
    state.dadosTemperaturaPI = dados;

    const semPontos = !dados?.dados?.TOPO?.pontos?.length;
    if (semPontos) {
        atualizarStatusFonte(false, null);
        canvas.style.display = 'none';
        if (semDados) { semDados.innerText = 'Nenhum dado retornado pelo PI para esse forno/período.'; semDados.style.display = 'block'; }
        renderizarIndicadores(null);
        renderizarTabelaLeituras(null);
        return;
    }

    canvas.style.display = 'block';
    if (semDados) semDados.style.display = 'none';

    if (state.charts.temperaturaGeral) { state.charts.temperaturaGeral.destroy(); }
    const config = montarConfigGraficoTemperatura(dados, bat, bloco, forno);
    state.charts.temperaturaGeral = new Chart(canvas, config);

    renderizarIndicadores(dados);
    renderizarTabelaLeituras(dados);
    atualizarStatusFonte(false, null);
}

function iniciarAtualizacaoAutomatica() {
    if (state.intervaloAtualizacaoTemp) clearInterval(state.intervaloAtualizacaoTemp);
    state.intervaloAtualizacaoTemp = setInterval(() => {
        // só busca de novo se a aba de Temperaturas estiver visível
        const secao = document.getElementById('temperaturas');
        if (secao && secao.classList.contains('active_section')) renderizarGraficoTemperaturaTab();
    }, INTERVALO_ATUALIZACAO_MS);
}

export function initTemperaturas() {
    document.getElementById('temp_periodo_inicio')?.addEventListener('change', aoMudarPeriodo);
    document.getElementById('temp_periodo_fim')?.addEventListener('change', aoMudarPeriodo);

    // Preenche o select de forno da aba (mesmo padrão "01".."18" do modal)
    (function preencherSelectFornoTemp() {
        const sel = document.getElementById('temp_filtro_forno');
        if (!sel || sel.options.length > 0) return;
        for (let i = 1; i <= 18; i++) {
            const f = i.toString().padStart(2, '0');
            sel.innerHTML += `<option value="${f}">${f}</option>`;
        }
    })();

    ['temp_filtro_bat', 'temp_filtro_bloco', 'temp_filtro_forno'].forEach(id => {
        document.getElementById(id)?.addEventListener('change', renderizarGraficoTemperaturaTab);
    });

    document.getElementById('btn_resetar_zoom_geral')?.addEventListener('click', () => state.charts.temperaturaGeral?.resetZoom());

    definirPeriodoPadrao();
    renderizarGraficoTemperaturaTab();
    iniciarAtualizacaoAutomatica();
}
