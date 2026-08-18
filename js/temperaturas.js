// =========================================================
// --- GRÁFICO DE TEMPERATURAS (CSV importado, só na sessão) ---
// =========================================================
// Guardado só em memória (state.dadosTemperaturaCSV) — nunca vai pro
// Supabase, e some se a página for recarregada (é preciso importar de novo).
import { state } from './state.js';
import { formatarDataBR } from './utils.js';

function paraInputData(ms) {
    const d = new Date(ms);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
}

// Assim que um CSV é importado, mostra por padrão os últimos 9 dias
// (contados a partir da data mais recente do arquivo inteiro).
function definirPeriodoPadrao() {
    if (state.dadosTemperaturaCSV.length === 0) return;
    const maxData = state.dadosTemperaturaCSV.reduce((max, r) => r.data > max ? r.data : max, state.dadosTemperaturaCSV[0].data);
    const NOVE_DIAS_MS = 9 * 24 * 60 * 60 * 1000;
    state.periodoTempFim = maxData;
    state.periodoTempInicio = maxData - NOVE_DIAS_MS;
    sincronizarInputsPeriodo();
}

// Mantém os 3 pares de campo De/Até (aba, modal, expandido) todos iguais
function sincronizarInputsPeriodo() {
    if (state.periodoTempInicio === null || state.periodoTempFim === null) return;
    const valorIni = paraInputData(state.periodoTempInicio);
    const valorFim = paraInputData(state.periodoTempFim);
    ['temp_periodo_inicio', 'temp_periodo_inicio_modal', 'temp_periodo_inicio_expandido'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = valorIni;
    });
    ['temp_periodo_fim', 'temp_periodo_fim_modal', 'temp_periodo_fim_expandido'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = valorFim;
    });
}

function aoMudarPeriodo(idIni, idFim) {
    const ini = document.getElementById(idIni)?.value;
    const fim = document.getElementById(idFim)?.value;
    if (ini) state.periodoTempInicio = new Date(`${ini}T00:00:00`).getTime();
    if (fim) state.periodoTempFim = new Date(`${fim}T23:59:59`).getTime();
    sincronizarInputsPeriodo();
    renderizarGraficoTemperaturaTab();
    const modal = document.getElementById('modal_reparo');
    if (modal?.classList.contains('active')) renderizarGraficoTemperaturaModal();
    if (document.getElementById('grafico_expandido_overlay')?.classList.contains('active')) renderizarGraficoExpandido();
}

function parseNumeroBr(valor) {
    if (valor === undefined || valor === null) return null;
    const limpo = String(valor).trim().replace(',', '.');
    if (limpo === '') return null;
    const num = parseFloat(limpo);
    return isNaN(num) ? null : num; // valores como "Bad" viram null
}

function parseDataBrHora(str) {
    // Formato esperado: "DD/MM/AAAA HH:mm"
    const m = String(str).trim().match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})/);
    if (!m) return null;
    const [, dd, mm, yyyy, hh, min] = m;
    const data = new Date(Number(yyyy), Number(mm) - 1, Number(dd), Number(hh), Number(min));
    return isNaN(data.getTime()) ? null : data.getTime();
}

function formatarDataHoraCurta(ms) {
    const d = new Date(ms);
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const hh = String(d.getHours()).padStart(2, '0');
    const min = String(d.getMinutes()).padStart(2, '0');
    return `${dd}/${mm} ${hh}:${min}`;
}

// Lê o CSV exportado do histórico de temperaturas (separado por ";",
// números em vírgula). Aceita as colunas nesta ordem ou em qualquer
// outra, desde que os cabeçalhos tenham esses nomes exatos.
function parseCsvTemperaturas(texto) {
    const linhas = texto.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').split('\n').filter(l => l.trim().length > 0);
    if (linhas.length < 2) return [];

    const header = linhas[0].split(';').map(h => h.trim());
    const idx = {
        bateria: header.indexOf('BATERIA'),
        bloco: header.indexOf('BLOCO'),
        forno: header.indexOf('FORNO'),
        data: header.indexOf('DATA'),
        topo: header.indexOf('TOPO TEMP.'),
        lc: header.indexOf('LC TEMP.'),
        lm: header.indexOf('LM TEMP.'),
        ck: header.indexOf('CK TIME'),
    };
    const faltando = Object.entries(idx).filter(([, v]) => v === -1).map(([k]) => k);
    if (faltando.length > 0) {
        throw new Error(`Colunas não encontradas no CSV: ${faltando.join(', ')}. Confira o cabeçalho do arquivo.`);
    }

    const registros = [];
    for (let i = 1; i < linhas.length; i++) {
        const campos = linhas[i].split(';');
        if (campos.length < header.length) continue;

        const timestamp = parseDataBrHora(campos[idx.data]);
        if (timestamp === null) continue;

        registros.push({
            bateria: (campos[idx.bateria] || '').trim(),
            bloco: (campos[idx.bloco] || '').trim(),
            forno: (campos[idx.forno] || '').trim().padStart(2, '0'), // alinha com o padrão "01".."18" usado no resto do app
            data: timestamp,
            topo: parseNumeroBr(campos[idx.topo]),
            lc: parseNumeroBr(campos[idx.lc]),
            lm: parseNumeroBr(campos[idx.lm]),
            ck: parseNumeroBr(campos[idx.ck]),
        });
    }
    return registros;
}

function atualizarStatusCsvTemperatura() {
    const el = document.getElementById('status_csv_temp');
    if (!el) return;
    if (state.dadosTemperaturaCSV.length === 0) {
        el.innerText = 'Nenhum arquivo importado nesta sessão.';
        return;
    }
    let minVal = state.dadosTemperaturaCSV[0].data, maxVal = state.dadosTemperaturaCSV[0].data;
    for (const r of state.dadosTemperaturaCSV) {
        if (r.data < minVal) minVal = r.data;
        if (r.data > maxVal) maxVal = r.data;
    }
    const min = new Date(minVal);
    const max = new Date(maxVal);
    el.innerText = `${state.dadosTemperaturaCSV.length.toLocaleString('pt-BR')} registros carregados (${min.toLocaleDateString('pt-BR')} a ${max.toLocaleDateString('pt-BR')})`;
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

function construirDatasetTemperatura(bateria, bloco, forno) {
    let registros = state.dadosTemperaturaCSV.filter(r => r.bateria === bateria && r.bloco === bloco && r.forno === forno);
    if (state.periodoTempInicio !== null) registros = registros.filter(r => r.data >= state.periodoTempInicio);
    if (state.periodoTempFim !== null) registros = registros.filter(r => r.data <= state.periodoTempFim);
    return registros.sort((a, b) => a.data - b.data);
}

function montarConfigGraficoTemperatura(registros, bateria, bloco, forno) {
    const labels = registros.map(r => formatarDataHoraCurta(r.data));

    // Localiza, pra cada reparo CONCLUÍDO desse forno, o ponto do
    // gráfico mais próximo da data de conclusão, pra desenhar a linha
    // vertical de referência ali.
    const reparosConcluidos = state.dbReparos.filter(r =>
        r.bateria === bateria && r.bloco === bloco && r.forno === forno &&
        r.andamento === 'concluido' && r.data_fim
    );
    const indicesConclusao = [];
    reparosConcluidos.forEach(rep => {
        const alvoMs = new Date(`${rep.data_fim}T12:00:00`).getTime();
        if (isNaN(alvoMs)) return;
        let melhorIndex = -1, melhorDist = Infinity;
        registros.forEach((r, i) => {
            const dist = Math.abs(r.data - alvoMs);
            if (dist < melhorDist) { melhorDist = dist; melhorIndex = i; }
        });
        // só marca se o ponto mais próximo estiver a até 2 dias da conclusão
        if (melhorIndex !== -1 && melhorDist <= 2 * 24 * 60 * 60 * 1000) {
            indicesConclusao.push({ index: melhorIndex, label: `Reparo concluído: ${formatarDataBR(rep.data_fim)}` });
        }
    });

    return {
        type: 'line',
        data: {
            labels,
            datasets: [
                { label: 'TOPO TEMP.', data: registros.map(r => r.topo), borderColor: 'black', backgroundColor: 'black', yAxisID: 'yTemp', tension: 0.15, pointRadius: 0, borderWidth: 1.6, spanGaps: true },
                { label: 'LC TEMP.', data: registros.map(r => r.lc), borderColor: 'darkblue', backgroundColor: 'darkblue', yAxisID: 'yTemp', tension: 0.15, pointRadius: 0, borderWidth: 1.6, spanGaps: true },
                { label: 'LM TEMP.', data: registros.map(r => r.lm), borderColor: 'red', backgroundColor: 'red', yAxisID: 'yTemp', tension: 0.15, pointRadius: 0, borderWidth: 1.6, spanGaps: true },
                { label: 'CK TIME', data: registros.map(r => r.ck), borderColor: 'green', backgroundColor: 'green', yAxisID: 'yTemp', tension: 0.15, pointRadius: 0, borderWidth: 1.6, borderDash: [4, 3], spanGaps: true },
            ]
        },
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
                yTemp: { type: 'linear', position: 'left', title: { display: true, text: 'Temperatura (°C) / CK TIME', font: { size: 10 } } }
            }
        }
    };
}

function renderizarGraficoEm(canvasId, semDadosId, bateria, bloco, forno, setChart, getChart) {
    const canvas = document.getElementById(canvasId);
    const semDados = document.getElementById(semDadosId);
    if (!canvas) return;

    const chartAtual = getChart();
    if (chartAtual) { chartAtual.destroy(); setChart(null); }

    const registros = construirDatasetTemperatura(bateria, bloco, forno);
    if (registros.length === 0) {
        canvas.style.display = 'none';
        if (semDados) semDados.style.display = 'block';
        return;
    }
    canvas.style.display = 'block';
    if (semDados) semDados.style.display = 'none';

    const config = montarConfigGraficoTemperatura(registros, bateria, bloco, forno);
    setChart(new Chart(canvas, config));
}

export function renderizarGraficoTemperaturaTab() {
    const bat = document.getElementById('temp_filtro_bat')?.value;
    const bloco = document.getElementById('temp_filtro_bloco')?.value;
    const forno = document.getElementById('temp_filtro_forno')?.value;
    if (!bat || !bloco || !forno) return;
    renderizarGraficoEm('grafico_temperatura_geral', 'temp_sem_dados_geral', bat, bloco, forno,
        (c) => { state.charts.temperaturaGeral = c; }, () => state.charts.temperaturaGeral);
}

export function renderizarGraficoTemperaturaModal() {
    const canvas = document.getElementById('grafico_temperatura_modal');
    const semDados = document.getElementById('temp_sem_dados_modal');
    if (!canvas) return;

    const bat = document.getElementById('sel_bat')?.value;
    const bloco = document.getElementById('sel_bloco')?.value;
    const forno = document.getElementById('sel_forno')?.value;

    if (!bat || !bloco || !forno || forno === 'N/A') {
        if (state.charts.temperaturaModal) { state.charts.temperaturaModal.destroy(); state.charts.temperaturaModal = null; }
        canvas.style.display = 'none';
        if (semDados) { semDados.style.display = 'block'; semDados.innerText = 'Este alvo (Coletor) não tem dados de temperatura por forno.'; }
        return;
    }
    if (semDados) semDados.innerText = 'Nenhum dado de temperatura importado para este forno. Importe um CSV na aba "Gráfico de Temperaturas".';

    renderizarGraficoEm('grafico_temperatura_modal', 'temp_sem_dados_modal', bat, bloco, forno,
        (c) => { state.charts.temperaturaModal = c; }, () => state.charts.temperaturaModal);
}

function renderizarGraficoExpandido() {
    const bat = document.getElementById('sel_bat')?.value;
    const bloco = document.getElementById('sel_bloco')?.value;
    const forno = document.getElementById('sel_forno')?.value;
    if (!bat || !bloco || !forno || forno === 'N/A') return;

    const titulo = document.getElementById('grafico_expandido_titulo');
    if (titulo) titulo.innerText = `Gráfico de Temperaturas — ${document.getElementById('forno_alvo').innerText}`;

    if (state.charts.temperaturaExpandido) { state.charts.temperaturaExpandido.destroy(); state.charts.temperaturaExpandido = null; }
    const registros = construirDatasetTemperatura(bat, bloco, forno);
    if (registros.length === 0) return;

    const config = montarConfigGraficoTemperatura(registros, bat, bloco, forno);
    state.charts.temperaturaExpandido = new Chart(document.getElementById('grafico_temperatura_expandido'), config);
}

export function initTemperaturas() {
    [['temp_periodo_inicio', 'temp_periodo_fim'], ['temp_periodo_inicio_modal', 'temp_periodo_fim_modal'], ['temp_periodo_inicio_expandido', 'temp_periodo_fim_expandido']]
        .forEach(([idIni, idFim]) => {
            document.getElementById(idIni)?.addEventListener('change', () => aoMudarPeriodo(idIni, idFim));
            document.getElementById(idFim)?.addEventListener('change', () => aoMudarPeriodo(idIni, idFim));
        });

    document.getElementById('btn_importar_csv_temp')?.addEventListener('click', () => {
        document.getElementById('input_csv_temperatura').click();
    });

    document.getElementById('input_csv_temperatura')?.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const btn = document.getElementById('btn_importar_csv_temp');
        const textoOriginal = btn.innerText;
        btn.disabled = true; btn.innerText = 'Importando...';

        const reader = new FileReader();
        reader.onload = (evt) => {
            // setTimeout(0) dá um respiro pra tela mostrar "Importando..."
            // antes de processar um arquivo grande (dezenas de milhares de linhas)
            setTimeout(() => {
                try {
                    const registros = parseCsvTemperaturas(evt.target.result);
                    if (registros.length === 0) throw new Error('Nenhum registro válido encontrado no arquivo.');
                    state.dadosTemperaturaCSV = registros;
                    atualizarStatusCsvTemperatura();
                    definirPeriodoPadrao();
                    renderizarGraficoTemperaturaTab();
                    const modal = document.getElementById('modal_reparo');
                    if (modal?.classList.contains('active')) renderizarGraficoTemperaturaModal();
                    alert(`Importado! ${registros.length.toLocaleString('pt-BR')} registros de temperatura carregados.\n\nEsses dados ficam só nesta aba do navegador — não são enviados ao Supabase.`);
                } catch (erro) {
                    console.error('Erro ao importar CSV de temperaturas:', erro);
                    alert(`Não foi possível importar o CSV.\n${erro.message}`);
                } finally {
                    btn.disabled = false; btn.innerText = textoOriginal;
                    e.target.value = '';
                }
            }, 0);
        };
        reader.onerror = () => {
            alert('Não foi possível ler o arquivo.');
            btn.disabled = false; btn.innerText = textoOriginal;
        };
        reader.readAsText(file, 'ISO-8859-1');
    });

    // Preenche o select de forno da aba (mesmo padrão "01".."18" do modal)
    (function preencherSelectFornoTemp() {
        const sel = document.getElementById('temp_filtro_forno');
        if (!sel) return;
        for (let i = 1; i <= 18; i++) {
            const f = i.toString().padStart(2, '0');
            sel.innerHTML += `<option value="${f}">${f}</option>`;
        }
    })();

    ['temp_filtro_bat', 'temp_filtro_bloco', 'temp_filtro_forno'].forEach(id => {
        document.getElementById(id)?.addEventListener('change', renderizarGraficoTemperaturaTab);
    });

    // --- Gráfico expandido (mesmo alvo do modal, em tela maior) ---
    const overlayGraficoExpandido = document.getElementById('grafico_expandido_overlay');

    document.getElementById('btn_expandir_grafico_modal')?.addEventListener('click', () => {
        sincronizarInputsPeriodo();
        overlayGraficoExpandido?.classList.add('active');
        renderizarGraficoExpandido();
    });

    function fecharGraficoExpandido() {
        overlayGraficoExpandido?.classList.remove('active');
        if (state.charts.temperaturaExpandido) { state.charts.temperaturaExpandido.destroy(); state.charts.temperaturaExpandido = null; }
    }
    document.getElementById('grafico_expandido_fechar')?.addEventListener('click', fecharGraficoExpandido);
    overlayGraficoExpandido?.addEventListener('click', (e) => { if (e.target === overlayGraficoExpandido) fecharGraficoExpandido(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && overlayGraficoExpandido?.classList.contains('active')) fecharGraficoExpandido(); });

    document.getElementById('btn_resetar_zoom_geral')?.addEventListener('click', () => state.charts.temperaturaGeral?.resetZoom());
    document.getElementById('btn_resetar_zoom_modal')?.addEventListener('click', () => state.charts.temperaturaModal?.resetZoom());
    document.getElementById('btn_resetar_zoom_expandido')?.addEventListener('click', () => state.charts.temperaturaExpandido?.resetZoom());
}
