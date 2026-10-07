// =========================================================
// --- PÁGINA "RELATÓRIO DE PASSAGEM DE TURNO" ---
// =========================================================
// Catálogo de itens (tabela relatorio_turno_itens, vinda da aba INDICADORES)
// + lançamentos (tabela relatorio_turno, uma linha por item). A página só
// serve de sinaleiro: cada card (Controle Térmico, Caldeiras, Máquinas,
// FGDs) mostra o ÚLTIMO registro de cada item até a data escolhida (padrão:
// hoje), com a data do registro, parâmetro/meta e cor (verde = na meta,
// vermelho = fora). Os dados são editados na "Tabela de Dados".
import { state, isAdminAtual, nomeExibicaoAtual } from './state.js';
import {
    listarRelatorioItensSupabase, listarRelatorioTurnoSupabase, listarUltimosRelatorioTurnoSupabase,
    gravarRelatorioTurnoSupabase, atualizarRelatorioTurnoSupabase, excluirRelatorioTurnoSupabase
} from './supabase-api.js';
import { formatarDataBR, debounce } from './utils.js';
import { mostrarToast } from './toast.js';

const SETORES = [
    { id: 'CONTROLE_TERMICO', rotulo: 'Controle Térmico' },
    { id: 'CALDEIRAS', rotulo: 'Caldeiras' },
    { id: 'MAQUINAS', rotulo: 'Máquinas' },
    { id: 'FGDS', rotulo: 'FGDs' },
];
const BATERIAS = ['A', 'B', 'C'];
const PREFIXO_EQUIPAMENTO = { MAQUINAS: 'Máquina', CALDEIRAS: 'Caldeira' };
// Como o nome do segmento aparece na planilha original (usado no Excel exportado)
const SEGMENTO_EXCEL = { CONTROLE_TERMICO: 'CONTROLE TÉRMICO', CALDEIRAS: 'CALDEIRA', MAQUINAS: 'MÁQUINAS MÓVEIS', FGDS: 'FGD' };

let modalLancamento, modalEdicao, modalTabela, tbodyTabela;
let registrosTabela = [];
let erroCarga = '';

// --- Utilitários ---

const el = (id) => document.getElementById(id);

// Aviso na tela que nunca derruba o fluxo (o dado já foi salvo quando ele aparece)
function avisar(texto, tipo, ms) {
    try { mostrarToast(texto, tipo, ms); } catch (erro) { console.warn('Falha ao exibir aviso:', erro); }
}

function esc(valor) {
    return String(valor ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function hojeLocal() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function somarDias(iso, dias) {
    const [a, m, d] = iso.split('-').map(Number);
    const data = new Date(a, m - 1, d + dias);
    return `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, '0')}-${String(data.getDate()).padStart(2, '0')}`;
}

function rotuloSetor(id) {
    return SETORES.find(s => s.id === id)?.rotulo || id;
}

function formatarNumero(v) {
    return Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 2 });
}

function uuid() {
    if (window.crypto?.randomUUID) return window.crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
        const r = Math.random() * 16 | 0;
        return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
}

function lerNumero(bruto) {
    if (bruto === '' || bruto === null || bruto === undefined) return null;
    const n = Number(String(bruto).replace(',', '.'));
    return Number.isFinite(n) ? n : null;
}

// --- Regra de meta (a mesma da trigger do banco) ---
// meta = { meta_min, min_inclusivo, meta_max, max_inclusivo }; devolve
// 'OK', 'NOK' ou null (sem valor ou sem meta numérica).
export function avaliarMeta(valor, meta) {
    const v = lerNumero(valor);
    if (v === null) return null;
    const temMin = meta.meta_min !== null && meta.meta_min !== undefined;
    const temMax = meta.meta_max !== null && meta.meta_max !== undefined;
    if (!temMin && !temMax) return null;
    if (temMin) {
        const min = Number(meta.meta_min);
        if (meta.min_inclusivo === false ? !(v > min) : !(v >= min)) return 'NOK';
    }
    if (temMax) {
        const max = Number(meta.meta_max);
        if (meta.max_inclusivo === false ? !(v < max) : !(v <= max)) return 'NOK';
    }
    return 'OK';
}

function temMetaNumerica(meta) {
    return (meta.meta_min !== null && meta.meta_min !== undefined) || (meta.meta_max !== null && meta.meta_max !== undefined);
}

const aceitaValor = (item) => item.entrada !== 'STATUS';
const statusManual = (item) => item.entrada === 'STATUS' || item.entrada === 'NUMERO_STATUS';

// --- Catálogo ---

function itensDoCard(bateria, setor) {
    return state.dbRelatorioItens
        .filter(i => i.ativo !== false && i.setor === setor && (!i.bateria || i.bateria === bateria))
        .sort((a, b) => (a.ordem - b.ordem) || (a.id - b.id));
}

function itemPorId(id) {
    return state.dbRelatorioItens.find(i => Number(i.id) === Number(id));
}

function agruparPorEquipamento(itens) {
    const grupos = [];
    const mapa = new Map();
    itens.forEach(i => {
        const chave = i.equipamento || '';
        if (!mapa.has(chave)) {
            const g = { equipamento: chave, itens: [] };
            mapa.set(chave, g);
            grupos.push(g);
        }
        mapa.get(chave).itens.push(i);
    });
    return grupos;
}

function rotuloEquipamento(setor, equipamento) {
    if (!equipamento) return '';
    return `${PREFIXO_EQUIPAMENTO[setor] || ''} ${equipamento}`.trim();
}

// Itens de máquina preenchidos a partir dos lançamentos da página Máquinas
// (média do dia da máquina). Sem lançamento no dia -> null (fica manual).
function valorAutomatico(item, data) {
    if (!item.fonte_auto) return null;
    const campo = item.fonte_auto === 'MAQUINA_PRESSAO' ? 'pressao_compactacao_bar' : 'desvio';
    const nums = state.dbMaquinas
        .filter(m => m.data === data && m.maquina === item.equipamento)
        .map(m => m[campo])
        .filter(v => v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v)))
        .map(Number);
    if (nums.length === 0) return null;
    return Math.round((nums.reduce((acc, v) => acc + v, 0) / nums.length) * 100) / 100;
}

// --- Carga de dados ---

// Último registro de cada item (por bateria e tipo) até a data da página.
// Usa a função relatorio_turno_ultimos do banco; se ela ainda não existir
// (SQL não rodado), cai pra uma busca dos últimos 30 dias.
const DIAS_FALLBACK = 30;
async function carregarDiaRelatorio() {
    const ate = el('rt_filtro_data')?.value || hojeLocal();
    try {
        state.dbRelatorio = await listarUltimosRelatorioTurnoSupabase(ate);
        return;
    } catch (erro) {
        console.warn('Função relatorio_turno_ultimos indisponível; buscando os últimos dias:', erro);
    }
    try {
        state.dbRelatorio = await listarRelatorioTurnoSupabase({ inicio: somarDias(ate, -DIAS_FALLBACK), fim: ate });
    } catch (erro) {
        console.warn('Não foi possível carregar os lançamentos do relatório de turno:', erro);
        state.dbRelatorio = [];
        erroCarga = erroCarga || erro.message;
    }
}

// Chamada pelo auth.js depois do login: catálogo + lançamentos do dia aberto.
export async function carregarRelatorioTurno() {
    erroCarga = '';
    if (!state.supabaseAtivo) {
        state.dbRelatorioItens = [];
        state.dbRelatorio = [];
        return;
    }
    try {
        state.dbRelatorioItens = await listarRelatorioItensSupabase();
    } catch (erro) {
        console.warn('Não foi possível carregar o catálogo do relatório de turno:', erro);
        state.dbRelatorioItens = [];
        erroCarga = erro.message;
    }
    await carregarDiaRelatorio();
}

export function limparRelatorioTurno() {
    state.dbRelatorioItens = [];
    state.dbRelatorio = [];
    registrosTabela = [];
    erroCarga = '';
}

async function recarregarRelatorio() {
    await carregarDiaRelatorio();
    renderizarRelatorioTurno();
    if (modalTabela?.classList.contains('active')) await carregarTabela();
}

// --- Página: cards sinaleiro ---

function registrosDaBateria(ate, bateria, tipo) {
    return state.dbRelatorio.filter(r => r.data <= ate && r.bateria === bateria && (tipo === 'Todos' || r.tipo === tipo));
}

// Último registro de cada item: data mais recente; no mesmo dia, o maior id
function ultimoPorItem(registros) {
    const mapa = new Map();
    registros.forEach(r => {
        const atual = mapa.get(Number(r.item_id));
        const maisNovo = !atual || r.data > atual.data || (r.data === atual.data && Number(r.id) > Number(atual.id));
        if (maisNovo) mapa.set(Number(r.item_id), r);
    });
    return mapa;
}

function textoValor(item, reg) {
    if (!reg) return '—';
    if (item.entrada === 'STATUS' || reg.valor === null || reg.valor === undefined) return reg.status || '—';
    return `${formatarNumero(reg.valor)}${item.unidade ? ` ${item.unidade}` : ''}`;
}

function htmlItemCard(item, reg) {
    const classe = !reg || !reg.status ? 'rt_sem' : (reg.status === 'NOK' ? 'rt_nok' : 'rt_ok');
    const parametro = reg?.parametro ?? item.parametro ?? '';
    const just = reg?.status === 'NOK' && reg.justificativa ? `<div class="rt_item_just">${esc(reg.justificativa)}</div>` : '';
    const tipo = reg ? `<span class="rt_item_tipo">${esc(reg.tipo)} · ${esc(formatarDataBR(reg.data).slice(0, 5))}</span>` : '';
    const dica = reg ? ` title="${esc(`${formatarDataBR(reg.data)} — ${reg.tipo}${reg.registrado_por ? ` — ${reg.registrado_por}` : ''}`)}"` : '';
    return `<div class="rt_item ${classe}"${dica}>
        <div class="rt_item_topo"><span class="rt_item_nome">${esc(item.item)}</span><span class="rt_item_valor">${esc(textoValor(item, reg))}</span></div>
        <div class="rt_item_meta"><span>${esc(parametro)}</span>${tipo}</div>${just}
    </div>`;
}

function htmlCard(bateria, setor, ultimo) {
    const itens = itensDoCard(bateria, setor.id);
    if (itens.length === 0) return '';

    const lancados = itens.filter(i => ultimo.has(Number(i.id)));
    const fora = lancados.filter(i => ultimo.get(Number(i.id)).status === 'NOK').length;
    let chip;
    if (fora > 0) chip = `<span class="rt_chip rt_chip_nok">${fora} fora da meta</span>`;
    else if (lancados.length > 0) chip = '<span class="rt_chip rt_chip_ok">Na meta</span>';
    else chip = '<span class="rt_chip rt_chip_sem">Sem lançamento</span>';

    const corpo = agruparPorEquipamento(itens).map(g => {
        const titulo = g.equipamento ? `<div class="rt_equip">${esc(rotuloEquipamento(setor.id, g.equipamento))}</div>` : '';
        return titulo + g.itens.map(i => htmlItemCard(i, ultimo.get(Number(i.id)))).join('');
    }).join('');

    return `<div class="rt_card" data-setor="${setor.id}">
        <header class="rt_card_header">
            <div class="rt_card_titulo"><h4>${esc(setor.rotulo)}</h4><small>${lancados.length}/${itens.length} com registro</small></div>
            ${chip}
            <button type="button" class="btn_acao rt_btn_lancar" data-acao="lancar" data-bateria="${bateria}" data-setor="${setor.id}"><svg class="icone" aria-hidden="true"><use href="#i-plus"></use></svg>Lançar</button>
        </header>
        <div class="rt_card_corpo">${corpo}</div>
    </div>`;
}

export function renderizarRelatorioTurno() {
    const raiz = el('rt_conteudo');
    if (!raiz) return;

    if (state.dbRelatorioItens.length === 0) {
        raiz.innerHTML = erroCarga
            ? `<p class="rt_vazio">Não foi possível carregar o relatório de turno.<br><small>${esc(erroCarga)}</small><br><small>Confira se os scripts SQL do relatório foram rodados no Supabase.</small></p>`
            : '<p class="rt_vazio">Nenhum item cadastrado no relatório de turno. Rode os scripts <strong>sql-relatorio-turno.sql</strong> e <strong>sql-relatorio-turno-itens.sql</strong> no Supabase.</p>';
        return;
    }

    const data = el('rt_filtro_data').value || hojeLocal();
    const tipo = el('rt_filtro_tipo').value;
    const filtro = state.filtroBateriaRelatorio || 'Todas';
    const baterias = filtro === 'Todas' ? BATERIAS : [filtro];

    raiz.innerHTML = baterias.map(b => {
        const ultimo = ultimoPorItem(registrosDaBateria(data, b, tipo));
        return `<div class="rt_bateria_bloco" data-bateria="${b}">
            <h3 class="rt_bateria_titulo">Bateria ${b}</h3>
            <div class="rt_cards">${SETORES.map(s => htmlCard(b, s, ultimo)).join('')}</div>
        </div>`;
    }).join('');
}

// --- Modal de lançamento (um card por vez) ---

function htmlItemForm(item, existente, auto) {
    const id = item.id;
    const valorInicial = existente ? existente.valor : auto;
    const valorTxt = valorInicial === null || valorInicial === undefined ? '' : String(valorInicial);
    const statusIni = existente?.status || '';
    const selecionado = (v) => (statusIni === v ? ' selected' : '');
    const origemAuto = (existente ? existente.origem === 'AUTO' : auto !== null && auto !== undefined);

    return `<div class="rt_form_item" data-item-id="${id}" data-auto="${auto ?? ''}">
        <div class="rt_form_linha">
            <label class="rt_form_nome" for="${aceitaValor(item) ? `rt_val_${id}` : `rt_st_${id}`}">${esc(item.item)}${origemAuto ? '<span class="rt_tag_auto">auto</span>' : ''}</label>
            ${aceitaValor(item) ? `<input type="text" inputmode="decimal" autocomplete="off" id="rt_val_${id}" class="rt_form_valor" placeholder="Valor" value="${esc(valorTxt)}">` : ''}
            ${aceitaValor(item) && item.unidade ? `<span class="rt_form_un">${esc(item.unidade)}</span>` : ''}
            ${statusManual(item) ? `<select id="rt_st_${id}" class="rt_form_status"><option value="">Status</option><option value="OK"${selecionado('OK')}>OK</option><option value="NOK"${selecionado('NOK')}>NOK</option></select>` : ''}
        </div>
        <div class="rt_form_extra">
            <input type="text" id="rt_just_${id}" class="rt_form_just" placeholder="Justificativa (item fora da meta)" value="${esc(existente?.justificativa || '')}" hidden>
            <input type="text" id="rt_obs_${id}" class="rt_form_obs" placeholder="Anotações (opcional)" value="${esc(existente?.observacao || '')}">
        </div>
    </div>`;
}

function montarFormularioItens() {
    const bateria = el('rt_bateria').value;
    const setor = el('rt_setor').value;
    const data = el('rt_data').value;
    const tipo = el('rt_tipo').value;
    el('rt_modal_titulo').textContent = `Lançamento — ${rotuloSetor(setor)} — Bateria ${bateria}`;

    // Se já existe lançamento desse tipo nesse dia, abre preenchido (relançar atualiza)
    const existentes = new Map();
    if (data && tipo) {
        state.dbRelatorio
            .filter(r => r.data === data && r.bateria === bateria && r.tipo === tipo)
            .forEach(r => existentes.set(Number(r.item_id), r));
    }

    const itens = itensDoCard(bateria, setor);
    const html = agruparPorEquipamento(itens).map(g => {
        const titulo = g.equipamento ? `<p class="label_destaque rt_form_secao">${esc(rotuloEquipamento(setor, g.equipamento))}</p>` : '';
        return titulo + g.itens.map(i => htmlItemForm(i, existentes.get(Number(i.id)), valorAutomatico(i, data))).join('');
    }).join('');

    el('rt_itens_form').innerHTML = html || '<p class="rt_vazio">Nenhum item cadastrado para este card.</p>';
    el('rt_itens_form').querySelectorAll('.rt_form_item').forEach(atualizarEstadoItemForm);
}

// Lê um item do formulário: { item, valor, status, justificativa, observacao, auto }
function lerItemForm(div) {
    const item = itemPorId(div.dataset.itemId);
    const campoValor = div.querySelector('.rt_form_valor');
    const campoStatus = div.querySelector('.rt_form_status');
    const valor = campoValor ? lerNumero(campoValor.value) : null;
    const valorInvalido = !!campoValor && campoValor.value.trim() !== '' && valor === null;
    let status;
    if (statusManual(item)) status = campoStatus.value || null;
    else status = avaliarMeta(valor, item);
    return {
        item,
        valor,
        valorInvalido,
        status,
        justificativa: div.querySelector('.rt_form_just').value.trim().toUpperCase(),
        observacao: div.querySelector('.rt_form_obs').value.trim().toUpperCase(),
        auto: div.dataset.auto === '' ? null : Number(div.dataset.auto),
    };
}

// Mostra a justificativa (obrigatória) só nos itens fora da meta
function atualizarEstadoItemForm(div) {
    const dados = lerItemForm(div);
    const fora = dados.status === 'NOK';
    div.classList.toggle('rt_form_item_nok', fora);
    div.classList.toggle('rt_form_item_ok', dados.status === 'OK');
    const campoJust = div.querySelector('.rt_form_just');
    campoJust.hidden = !fora;
    if (!fora || campoJust.value.trim()) campoJust.classList.remove('invalido');
}

function abrirModalLancamento({ bateria, setor } = {}) {
    if (!isAdminAtual()) { alert('Apenas usuários administradores podem lançar registros do relatório de turno.'); return; }
    if (state.dbRelatorioItens.length === 0) { alert('O catálogo de itens está vazio. Rode os scripts SQL do relatório de turno no Supabase.'); return; }

    el('rt_data').value = el('rt_filtro_data').value || hojeLocal();
    const tipoFiltro = el('rt_filtro_tipo').value;
    el('rt_tipo').value = tipoFiltro !== 'Todos' ? tipoFiltro : '';
    el('rt_bateria').value = bateria || (BATERIAS.includes(state.filtroBateriaRelatorio) ? state.filtroBateriaRelatorio : 'A');
    el('rt_setor').value = setor || 'CONTROLE_TERMICO';
    montarFormularioItens();
    modalLancamento.classList.add('active');
}

async function aoMudarDataModal() {
    // A data do modal acompanha a da página: recarrega o dia pra abrir preenchido se já houver lançamento
    const data = el('rt_data').value;
    if (data) {
        el('rt_filtro_data').value = data;
        await carregarDiaRelatorio();
        renderizarRelatorioTurno();
    }
    montarFormularioItens();
}

async function salvarLancamento() {
    if (!isAdminAtual()) { alert('Apenas usuários administradores podem lançar registros do relatório de turno.'); return; }
    const data = el('rt_data').value;
    const tipo = el('rt_tipo').value;
    const bateria = el('rt_bateria').value;
    const setor = el('rt_setor').value;

    if (!data) { alert('Informe a data do lançamento.'); return; }
    if (!tipo) { alert('Informe se o lançamento é ADM ou TURNO.'); el('rt_tipo').focus(); return; }

    const invalidos = [];
    el('rt_itens_form').querySelectorAll('.rt_form_item').forEach(div => {
        const d = lerItemForm(div);
        const campo = div.querySelector('.rt_form_valor');
        campo?.classList.toggle('invalido', d.valorInvalido);
        if (d.valorInvalido) invalidos.push(d.item.item);
    });
    if (invalidos.length > 0) {
        el('rt_itens_form').querySelector('.rt_form_valor.invalido')?.focus();
        alert(`Valor inválido (use só números, ex.: 12,5):\n- ${invalidos.join('\n- ')}`);
        return;
    }

    const lote = uuid();
    const registradoPor = nomeExibicaoAtual();
    const linhas = [];
    const semJustificativa = [];

    el('rt_itens_form').querySelectorAll('.rt_form_item').forEach(div => {
        const d = lerItemForm(div);
        if (d.valor === null && !d.status) return;   // item sem nada lançado: fica de fora

        if (d.status === 'NOK' && !d.justificativa) {
            semJustificativa.push(d.item.item);
            div.querySelector('.rt_form_just').classList.add('invalido');
        }
        const automatico = d.item.fonte_auto && d.auto !== null && d.valor === d.auto;
        linhas.push({
            lote_id: lote,
            data,
            bateria,
            setor,
            equipamento: d.item.equipamento ?? null,
            tipo,
            item_id: d.item.id,
            valor: d.valor,
            status: d.status,
            justificativa: d.justificativa || null,
            observacao: d.observacao || null,
            origem: automatico ? 'AUTO' : 'MANUAL',
            registrado_por: registradoPor,
        });
    });

    if (linhas.length === 0) { alert('Preencha pelo menos um item.'); return; }
    if (semJustificativa.length > 0) {
        el('rt_itens_form').querySelector('.rt_form_just.invalido')?.focus();
        alert(`Preencha a justificativa dos itens fora da meta:\n- ${semJustificativa.join('\n- ')}`);
        return;
    }

    const botao = el('btn_salvar_relatorio');
    botao.disabled = true;
    botao.innerText = 'Salvando...';
    try {
        await gravarRelatorioTurnoSupabase(linhas);
        const fora = linhas.filter(l => l.status === 'NOK').length;
        modalLancamento.classList.remove('active');
        await recarregarRelatorio();
        avisar(`Lançamento salvo (${linhas.length} itens${fora ? `, ${fora} fora da meta` : ''}).`, fora ? 'info' : 'sucesso');
    } catch (erro) {
        console.error('Erro ao salvar relatório de turno:', erro);
        alert(`Não foi possível salvar no Supabase.\n${erro.message}`);
    } finally {
        botao.disabled = false;
        botao.innerText = 'Salvar Lançamento';
    }
}

// --- Tabela de dados (edição/exclusão só para admin) ---

async function carregarTabela() {
    const inicio = el('rt_tab_inicio').value;
    const fim = el('rt_tab_fim').value;
    tbodyTabela.innerHTML = '<tr><td colspan="14" class="rt_tab_msg">Carregando...</td></tr>';
    try {
        registrosTabela = await listarRelatorioTurnoSupabase({ inicio, fim });
    } catch (erro) {
        console.error('Erro ao carregar a tabela do relatório de turno:', erro);
        registrosTabela = [];
        avisar(`Erro ao carregar o relatório: ${erro.message}`, 'erro', 8000);
    }
    renderizarTabela();
}

function contem(valorCampo, termo) {
    if (!termo) return true;
    return String(valorCampo || '').toLowerCase().includes(termo.trim().toLowerCase());
}

function registrosFiltradosTabela() {
    const f = {
        data: el('ftabr_data').value, bateria: el('ftabr_bateria').value, setor: el('ftabr_setor').value,
        tipo: el('ftabr_tipo').value, item: el('ftabr_item').value, status: el('ftabr_status').value,
        por: el('ftabr_registrado_por').value,
    };
    return registrosTabela.filter(r => {
        const item = itemPorId(r.item_id);
        if (!contem(r.data, f.data)) return false;
        if (f.bateria !== 'Todas' && r.bateria !== f.bateria) return false;
        if (f.setor !== 'Todos' && r.setor !== f.setor) return false;
        if (f.tipo !== 'Todos' && r.tipo !== f.tipo) return false;
        if (!contem(item?.item, f.item)) return false;
        if (f.status !== 'Todos' && (r.status || '') !== f.status) return false;
        if (!contem(r.registrado_por, f.por)) return false;
        return true;
    }).sort((a, b) => {
        if (a.data !== b.data) return a.data < b.data ? 1 : -1;
        if (a.bateria !== b.bateria) return a.bateria < b.bateria ? -1 : 1;
        const sa = SETORES.findIndex(s => s.id === a.setor), sb = SETORES.findIndex(s => s.id === b.setor);
        if (sa !== sb) return sa - sb;
        return (itemPorId(a.item_id)?.ordem ?? 0) - (itemPorId(b.item_id)?.ordem ?? 0);
    });
}

function renderizarTabela() {
    if (!tbodyTabela) return;
    const filtrados = registrosFiltradosTabela();
    if (filtrados.length === 0) {
        tbodyTabela.innerHTML = '<tr><td colspan="14" class="rt_tab_msg">Nenhum registro encontrado no período/filtros atuais.</td></tr>';
        return;
    }
    const admin = isAdminAtual();
    tbodyTabela.innerHTML = filtrados.map(r => {
        const item = itemPorId(r.item_id);
        const classeStatus = r.status === 'NOK' ? 'prazo_atrasado' : (r.status === 'OK' ? 'prazo_ok' : '');
        const valor = r.valor === null || r.valor === undefined ? '-' : `${formatarNumero(r.valor)}${item?.unidade ? ` ${esc(item.unidade)}` : ''}`;
        return `<tr>
            <td><strong>${formatarDataBR(r.data)}</strong></td>
            <td>${esc(r.bateria)}</td>
            <td>${esc(rotuloSetor(r.setor))}</td>
            <td>${esc(r.equipamento || '-')}</td>
            <td>${esc(r.tipo)}</td>
            <td>${esc(item?.item || `#${r.item_id}`)}</td>
            <td>${valor}</td>
            <td>${esc(r.parametro || '-')}</td>
            <td>${r.status ? `<span class="badge_prazo ${classeStatus}">${esc(r.status)}</span>` : '-'}</td>
            <td>${esc(r.justificativa || '-')}</td>
            <td>${esc(r.observacao || '-')}</td>
            <td>${esc(r.origem || '-')}</td>
            <td>${esc(r.registrado_por || '-')}</td>
            <td>${admin ? `<div class="acoes_linha">
                <button class="btn_icone icone_editar" onclick="editarRelatorioTurno('${r.id}')" aria-label="Editar"><svg class="icone" aria-hidden="true"><use href="#i-pencil"></use></svg></button>
                <button class="btn_icone icone_excluir" onclick="deletarRelatorioTurno('${r.id}')" aria-label="Excluir"><svg class="icone" aria-hidden="true"><use href="#i-trash"></use></svg></button>
            </div>` : ''}</td>
        </tr>`;
    }).join('');
}

function limparFiltrosTabela() {
    el('ftabr_data').value = ''; el('ftabr_item').value = ''; el('ftabr_registrado_por').value = '';
    ['ftabr_bateria', 'ftabr_setor', 'ftabr_tipo', 'ftabr_status'].forEach(id => { el(id).selectedIndex = 0; });
    renderizarTabela();
}

// --- Edição de uma linha ---

function registroPorId(id) {
    return registrosTabela.find(r => String(r.id) === String(id)) || state.dbRelatorio.find(r => String(r.id) === String(id));
}

function atualizarStatusEdicao() {
    const reg = registroPorId(el('rt_ed_id').value);
    if (!reg) return;
    const item = itemPorId(reg.item_id);
    const automatico = temMetaNumerica(reg);
    const campoStatus = el('rt_ed_status');
    if (automatico) {
        const calculado = avaliarMeta(el('rt_ed_valor').value, reg);
        campoStatus.value = calculado || '';
        campoStatus.disabled = true;
    } else {
        campoStatus.disabled = false;
    }
    const fora = campoStatus.value === 'NOK';
    el('rt_ed_just_grupo').classList.toggle('rt_just_obrigatoria', fora);
    if (!fora) el('rt_ed_just').classList.remove('invalido');
    el('rt_ed_valor_grupo').hidden = !item || !aceitaValor(item);
}

window.editarRelatorioTurno = function (id) {
    if (!isAdminAtual()) { alert('Apenas usuários administradores podem editar registros do relatório de turno.'); return; }
    const reg = registroPorId(id);
    if (!reg) return;
    const item = itemPorId(reg.item_id);

    el('rt_ed_id').value = reg.id;
    el('rt_ed_titulo').textContent = `${item?.item || `Item #${reg.item_id}`} — Bateria ${reg.bateria}${reg.equipamento ? ` — ${reg.equipamento}` : ''}`;
    el('rt_ed_param').textContent = reg.parametro ? `Parâmetro / meta: ${reg.parametro}` : '';
    el('rt_ed_data').value = reg.data;
    el('rt_ed_tipo').value = reg.tipo;
    el('rt_ed_valor').value = reg.valor ?? '';
    el('rt_ed_status').value = reg.status || '';
    el('rt_ed_just').value = reg.justificativa || '';
    el('rt_ed_obs').value = reg.observacao || '';
    atualizarStatusEdicao();

    modalTabela.classList.remove('active');
    modalEdicao.classList.add('active');
};

async function salvarEdicao() {
    if (!isAdminAtual()) { alert('Apenas usuários administradores podem editar registros do relatório de turno.'); return; }
    const reg = registroPorId(el('rt_ed_id').value);
    if (!reg) return;
    const item = itemPorId(reg.item_id);

    const data = el('rt_ed_data').value;
    if (!data) { alert('Informe a data.'); return; }
    const valor = item && !aceitaValor(item) ? null : lerNumero(el('rt_ed_valor').value);
    const status = temMetaNumerica(reg) ? avaliarMeta(valor, reg) : (el('rt_ed_status').value || null);
    const justificativa = el('rt_ed_just').value.trim().toUpperCase();

    if (status === 'NOK' && !justificativa) {
        el('rt_ed_just').classList.add('invalido');
        el('rt_ed_just').focus();
        alert('Este item está fora da meta. Preencha a justificativa para salvar.');
        return;
    }

    const botao = el('btn_salvar_edicao_relatorio');
    botao.disabled = true;
    botao.innerText = 'Salvando...';
    try {
        await atualizarRelatorioTurnoSupabase(reg.id, {
            data,
            tipo: el('rt_ed_tipo').value,
            valor,
            status,
            justificativa: justificativa || null,
            observacao: el('rt_ed_obs').value.trim().toUpperCase() || null,
            origem: 'MANUAL',
        });
        modalEdicao.classList.remove('active');
        modalTabela.classList.add('active');     // reabre a tabela antes de recarregar (recarregarRelatorio só atualiza a tabela se ela estiver aberta)
        await recarregarRelatorio();
        avisar('Registro atualizado.', 'sucesso');
    } catch (erro) {
        console.error('Erro ao atualizar registro do relatório de turno:', erro);
        alert(`Não foi possível salvar no Supabase.\n${erro.message}`);
    } finally {
        botao.disabled = false;
        botao.innerText = 'Atualizar Registro';
    }
}

window.deletarRelatorioTurno = async function (id) {
    if (!isAdminAtual()) { alert('Apenas usuários administradores podem excluir registros do relatório de turno.'); return; }
    if (!confirm('Deseja excluir este registro?')) return;
    try {
        await excluirRelatorioTurnoSupabase(id);
        await recarregarRelatorio();
    } catch (erro) {
        console.error('Erro ao excluir registro do relatório de turno:', erro);
        alert(`Não foi possível excluir no Supabase.\n${erro.message}`);
    }
};

// --- Exportação ---

async function exportarExcel() {
    const inicio = el('rt_tab_inicio').value;
    const fim = el('rt_tab_fim').value;
    let registros;
    try {
        registros = await listarRelatorioTurnoSupabase({ inicio, fim });
    } catch (erro) {
        alert(`Não foi possível buscar os dados no Supabase.\n${erro.message}`);
        return;
    }
    if (registros.length === 0) { alert('Nenhum registro no período selecionado (ajuste as datas na Tabela de Dados).'); return; }

    const linhas = registros.map(r => {
        const item = itemPorId(r.item_id);
        const segmento = SEGMENTO_EXCEL[r.setor] || r.setor;
        return {
            'DATA': formatarDataBR(r.data),
            'BATERIA': r.bateria,
            'TIPO': r.tipo,
            'ITEM DE CONTROLE': item?.item || `#${r.item_id}`,
            'SEGMENTO': r.equipamento ? `${segmento} ${r.equipamento}` : segmento,
            'VALOR / QUANTIDADE': r.valor,
            'UNIDADE': item?.unidade || '',
            'PARÂMETRO / META': r.parametro,
            'STATUS': r.status,
            'JUSTIFICATIVA (S)': r.justificativa,
            'ANOTAÇÕES / OBSERVAÇÕES': r.observacao,
            'ORIGEM': r.origem,
            'REGISTRADO POR': r.registrado_por,
        };
    });
    const planilha = XLSX.utils.json_to_sheet(linhas);
    const livro = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(livro, planilha, 'Relatório de Turno');
    XLSX.writeFile(livro, `relatorio_turno_${inicio || 'inicio'}_a_${fim || 'hoje'}.xlsx`);
}

// --- Inicialização ---

export function initRelatorioTurno() {
    modalLancamento = el('modal_relatorio');
    modalEdicao = el('modal_relatorio_edicao');
    modalTabela = el('modal_tabela_relatorio');
    tbodyTabela = el('tbody_banco_relatorio');
    if (!modalLancamento) return;

    // Selects fixos
    el('rt_setor').innerHTML = SETORES.map(s => `<option value="${s.id}">${s.rotulo}</option>`).join('');
    el('ftabr_setor').innerHTML = '<option value="Todos">Todos</option>' + SETORES.map(s => `<option value="${s.id}">${s.rotulo}</option>`).join('');

    // Datas padrão
    const hoje = hojeLocal();
    el('rt_filtro_data').value = hoje;
    el('rt_tab_fim').value = hoje;
    el('rt_tab_inicio').value = somarDias(hoje, -7);

    // Página
    el('rt_filtro_data').addEventListener('change', async () => {
        await carregarDiaRelatorio();
        renderizarRelatorioTurno();
    });
    el('rt_filtro_tipo').addEventListener('change', renderizarRelatorioTurno);
    el('rt_conteudo').addEventListener('click', (e) => {
        const botao = e.target.closest('[data-acao="lancar"]');
        if (botao) abrirModalLancamento({ bateria: botao.dataset.bateria, setor: botao.dataset.setor });
    });
    el('btn_abrir_lancamento_relatorio').addEventListener('click', () => abrirModalLancamento());
    el('btn_baixar_excel_relatorio').addEventListener('click', exportarExcel);
    el('btn_abrir_tabela_relatorio').addEventListener('click', async () => {
        modalTabela.classList.add('active');
        await carregarTabela();
    });

    // Modal de lançamento
    el('fechar_modal_relatorio').addEventListener('click', () => modalLancamento.classList.remove('active'));
    el('btn_cancelar_relatorio').addEventListener('click', () => modalLancamento.classList.remove('active'));
    modalLancamento.addEventListener('click', (e) => { if (e.target === modalLancamento) modalLancamento.classList.remove('active'); });
    el('rt_data').addEventListener('change', aoMudarDataModal);
    ['rt_tipo', 'rt_bateria', 'rt_setor'].forEach(id => el(id).addEventListener('change', montarFormularioItens));
    el('rt_itens_form').addEventListener('input', (e) => { const d = e.target.closest('.rt_form_item'); if (d) atualizarEstadoItemForm(d); });
    el('rt_itens_form').addEventListener('change', (e) => { const d = e.target.closest('.rt_form_item'); if (d) atualizarEstadoItemForm(d); });
    el('btn_salvar_relatorio').addEventListener('click', salvarLancamento);

    // Modal de edição de uma linha
    el('fechar_modal_relatorio_edicao').addEventListener('click', () => { modalEdicao.classList.remove('active'); modalTabela.classList.add('active'); });
    el('btn_cancelar_edicao_relatorio').addEventListener('click', () => { modalEdicao.classList.remove('active'); modalTabela.classList.add('active'); });
    el('rt_ed_valor').addEventListener('input', atualizarStatusEdicao);
    el('rt_ed_status').addEventListener('change', atualizarStatusEdicao);
    el('btn_salvar_edicao_relatorio').addEventListener('click', salvarEdicao);

    // Tabela de dados
    el('fechar_modal_tabela_relatorio').addEventListener('click', () => modalTabela.classList.remove('active'));
    el('btn_limpar_filtros_tabela_relatorio').addEventListener('click', limparFiltrosTabela);
    el('btn_novo_tabela_relatorio').addEventListener('click', () => {
        modalTabela.classList.remove('active');
        abrirModalLancamento();
    });
    [el('rt_tab_inicio'), el('rt_tab_fim')].forEach(c => c.addEventListener('change', carregarTabela));
    ['ftabr_bateria', 'ftabr_setor', 'ftabr_tipo', 'ftabr_status'].forEach(id => el(id).addEventListener('change', renderizarTabela));
    ['ftabr_data', 'ftabr_item', 'ftabr_registrado_por'].forEach(id => el(id).addEventListener('input', debounce(renderizarTabela)));
}
