// =========================================================
// --- PÁGINA "ITENS DE CONTROLE" ---
// =========================================================
// Quatro controles (Comporta, Sapata, Truck e Queda de Material) com a mesma
// mecânica: seleciona o controle, vê a tabela dos principais itens do período,
// abre o banco completo (filtros, quem lançou, editar/excluir), baixa o Excel
// e faz novos lançamentos. Tudo é montado a partir da configuração CONTROLES,
// então incluir/alterar um campo é só mexer nela (e na tabela do Supabase).
// Lançar, editar e excluir: administradores (o RLS do banco garante).
import { state, isAdminAtual, nomeExibicaoAtual } from './state.js';
import { listarControleSupabase, criarControleSupabase, atualizarControleSupabase, excluirControleSupabase } from './supabase-api.js';
import { formatarDataBR, debounce } from './utils.js';
import { mostrarToast } from './toast.js';

const BATERIAS = ['A', 'B', 'C'];
const NUMEROS_MAQUINA = ['31', '33', '32'];        // ordem física: a 33 fica entre a 31 e a 32
const eh33 = (maquina) => String(maquina || '').startsWith('33');
const OKNOK = ['OK', 'NOK'];

// --- Campos reutilizados ---
const C_DATA = { id: 'data', rotulo: 'Data', tipo: 'data' };
const C_BATERIA = { id: 'bateria', rotulo: 'Bateria', tipo: 'bateria' };
const C_MAQUINA = { id: 'maquina', rotulo: 'Máquina', tipo: 'maquina' };
const C_OBS = { id: 'observacao', rotulo: 'Observação', tipo: 'texto', opcional: true, largo: true };
const medida = (id, rotulo, faixa) => ({ id, rotulo, tipo: 'numero', unidade: 'mm', faixa });
const oknok = (id, rotulo, grupo, soCarga = false) => ({ id, rotulo, tipo: 'oknok', grupo, visivel: soCarga ? (d) => !eh33(d.maquina) : null });

const FAIXA_COMPORTA = [420, 480];
const FAIXA_SAPATA = [30, 45];

const CAMPOS_TRUCK = [
    oknok('truck_hopper_01', 'Truck hopper 01', 'Trucks do hopper', true),
    oknok('truck_hopper_02', 'Truck hopper 02', 'Trucks do hopper', true),
    oknok('truck_hopper_03', 'Truck hopper 03', 'Trucks do hopper', true),
    oknok('truck_hopper_04', 'Truck hopper 04', 'Trucks do hopper', true),
    oknok('truck_maquina_01', 'Truck máquina 01', 'Trucks da máquina'),
    oknok('truck_maquina_02', 'Truck máquina 02', 'Trucks da máquina'),
    oknok('truck_maquina_03', 'Truck máquina 03', 'Trucks da máquina', true),
    oknok('truck_maquina_04', 'Truck máquina 04', 'Trucks da máquina', true),
    oknok('freio_01', 'Freio 01', 'Freios'),
    oknok('freio_02', 'Freio 02', 'Freios'),
    oknok('freio_03', 'Freio 03', 'Freios', true),
    oknok('freio_04', 'Freio 04', 'Freios', true),
];

const materialDaLinha = (linha) => (linha ? (eh33(linha) ? 'Moinha' : 'Cain') : '');

// Status de medição: DESVIO se algum valor sair da faixa
function statusPorFaixa(campos) {
    return (d) => {
        const valores = campos.map(c => d[c.id]).filter(v => v !== null && v !== undefined && v !== '');
        if (valores.length === 0) return '';
        return campos.some(c => foraDaFaixa(d[c.id], c.faixa)) ? 'DESVIO' : 'OK';
    };
}

function foraDaFaixa(valor, faixa) {
    if (!faixa || valor === null || valor === undefined || valor === '') return false;
    const n = Number(valor);
    return Number.isFinite(n) && (n < faixa[0] || n > faixa[1]);
}

const MEDIDAS_COMPORTA = [
    medida('lado_torre_mm', 'Lado Torre', FAIXA_COMPORTA),
    medida('centro_mm', 'Centro', FAIXA_COMPORTA),
    medida('lado_forno_falso_mm', 'Lado Forno Falso', FAIXA_COMPORTA),
];
const MEDIDAS_SAPATA = [
    medida('altura_t_mm', 'Altura da sapata T', FAIXA_SAPATA),
    medida('altura_m_mm', 'Altura da sapata M', FAIXA_SAPATA),
    medida('altura_f_mm', 'Altura da sapata F', FAIXA_SAPATA),
];

// col(campo, rotulo, tipo, extra) — colunas das tabelas
const col = (campo, rotulo, tipo = 'texto', extra = {}) => ({ campo, rotulo, tipo, ...extra });
const colMedida = (c) => col(c.id, `${c.rotulo} (mm)`, 'numero', { faixa: c.faixa });
const COLS_AUDITORIA = [
    col('registrado_por', 'Registrado por'), col('criado_em', 'Lançado em', 'datahora'),
    col('atualizado_por', 'Atualizado por'), col('atualizado_em', 'Atualizado em', 'datahora'),
];

export const CONTROLES = {
    comporta: {
        titulo: 'Comporta', tituloModal: 'Medição de Comporta', tabela: 'controle_comporta', icone: 'i-porta',
        campos: [C_DATA, C_BATERIA, C_MAQUINA,
            { id: 'linha', rotulo: 'Linha', tipo: 'select', opcoes: ['L1', 'L2'] },
            ...MEDIDAS_COMPORTA, C_OBS],
        status: statusPorFaixa(MEDIDAS_COMPORTA),
        colunas: [col('data', 'Data', 'data'), col('maquina', 'Máquina'), col('linha', 'Linha'),
            ...MEDIDAS_COMPORTA.map(colMedida), col('status', 'Status', 'status'), col('observacao', 'Observação')],
        colunasBanco: [col('bateria', 'Bateria')],
    },
    sapata: {
        titulo: 'Sapata', tituloModal: 'Sapata', tabela: 'controle_sapata', icone: 'i-regua',
        campos: [C_DATA, C_BATERIA, C_MAQUINA, ...MEDIDAS_SAPATA, C_OBS],
        status: statusPorFaixa(MEDIDAS_SAPATA),
        colunas: [col('data', 'Data', 'data'), col('maquina', 'Máquina'),
            ...MEDIDAS_SAPATA.map(colMedida), col('status', 'Status', 'status'), col('observacao', 'Observação')],
        colunasBanco: [col('bateria', 'Bateria')],
    },
    truck: {
        titulo: 'Truck', tituloModal: 'Relatório dos Trucks', tabela: 'controle_truck', icone: 'i-truck',
        campos: [C_DATA, C_BATERIA, C_MAQUINA, ...CAMPOS_TRUCK, C_OBS],
        colunas: [col('data', 'Data', 'data'), col('bateria', 'Bateria'), col('maquina', 'Máquina'),
            ...CAMPOS_TRUCK.map(c => col(c.id, c.rotulo, 'oknok')), col('observacao', 'Observação')],
        colunasBanco: [],
    },
    queda: {
        titulo: 'Queda de Material', tituloModal: 'Relatório de Queda de Material', tabela: 'controle_queda_material', icone: 'i-queda',
        campos: [C_DATA, C_BATERIA, { id: 'linha', rotulo: 'Linha', tipo: 'maquina' },
            { id: 'numero_viagem', rotulo: 'Nº viagem', tipo: 'inteiro' },
            { id: 'peso_t', rotulo: 'Peso', tipo: 'numero', unidade: 't' },
            { id: 'material', rotulo: 'Material', tipo: 'derivado', calcular: (d) => materialDaLinha(d.linha) },
            C_OBS],
        derivados: { material: (r) => r.material || materialDaLinha(r.linha) },
        colunas: [col('data', 'Data', 'data'), col('bateria', 'Bateria'), col('linha', 'Linha'),
            col('numero_viagem', 'Nº viagem', 'numero'), col('peso_t', 'Peso (t)', 'numero'), col('material', 'Material'), col('observacao', 'Observação')],
        colunasBanco: [],
    },
};

// --- Estado da página ---
let controleAtual = null;                 // id em CONTROLES
let registroEmEdicao = null;              // registro sendo editado no modal (null = novo)
const cache = {};                         // { [controle]: { dados: [], carregado: bool } }

const $ = (id) => document.getElementById(id);
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function hojeISO(deslocDias = 0) {
    const d = new Date();
    d.setDate(d.getDate() + deslocDias);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function lerNumero(texto) {
    const t = String(texto ?? '').trim().replace(/\s/g, '').replace(',', '.');
    if (t === '') return null;
    const n = Number(t);
    return Number.isFinite(n) ? n : NaN;
}

function formatarNumero(v) {
    if (v === null || v === undefined || v === '') return '-';
    const n = Number(v);
    return Number.isFinite(n) ? n.toLocaleString('pt-BR', { maximumFractionDigits: 2 }) : esc(v);
}

function formatarDataHora(v) {
    if (!v) return '-';
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? esc(v) : d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

function valorDoRegistro(cfg, reg, campo) {
    if (campo === 'status' && cfg.status) return reg.status || cfg.status(reg);
    if (cfg.derivados?.[campo]) return cfg.derivados[campo](reg);
    return reg[campo];
}

// Célula formatada (cores para OK/NOK, status e medidas fora da faixa)
function htmlCelula(cfg, reg, c) {
    const v = valorDoRegistro(cfg, reg, c.campo);
    switch (c.tipo) {
        case 'data': return `<td><strong>${esc(formatarDataBR(v))}</strong></td>`;
        case 'datahora': return `<td>${formatarDataHora(v)}</td>`;
        case 'numero': return `<td class="${foraDaFaixa(v, c.faixa) ? 'ic_fora' : ''}">${formatarNumero(v)}</td>`;
        case 'oknok':
            if (v === 'OK') return '<td class="ic_cel_ok">OK</td>';
            if (v === 'NOK') return '<td class="ic_cel_nok">NOK</td>';
            return '<td>-</td>';
        case 'status':
            if (!v) return '<td>-</td>';
            return `<td><span class="badge_prazo ${v === 'DESVIO' ? 'prazo_atrasado' : 'prazo_ok'}">${esc(v)}</span></td>`;
        default: return `<td>${v === null || v === undefined || v === '' ? '-' : esc(v)}</td>`;
    }
}

// --- Dados ---

async function carregarControle(id, forcar = false) {
    const cfg = CONTROLES[id];
    if (!cache[id]) cache[id] = { dados: [], carregado: false };
    if (cache[id].carregado && !forcar) return;
    if (!state.supabaseAtivo || !state.sessaoAtual) { cache[id] = { dados: [], carregado: true }; return; }
    try {
        cache[id].dados = await listarControleSupabase(cfg.tabela) || [];
        cache[id].carregado = true;
    } catch (erro) {
        console.error(`Erro ao carregar ${cfg.titulo}:`, erro);
        mostrarToast(`Não foi possível carregar ${cfg.titulo} do Supabase.\n${erro.message}`, 'erro', 8000);
    }
}

const dadosAtuais = () => (cache[controleAtual]?.dados || []).slice()
    .sort((a, b) => String(b.data).localeCompare(String(a.data)) || (Number(b.id) || 0) - (Number(a.id) || 0));

// Bateria escolhida no menu lateral (Todas, A, B ou C)
const bateriaFiltro = () => (BATERIAS.includes(state.filtroBateriaItensControle) ? state.filtroBateriaItensControle : null);

function dadosDoPeriodo() {
    const inicio = $('ic_inicio').value;
    const fim = $('ic_fim').value;
    const bateria = bateriaFiltro();
    return dadosAtuais().filter(r => (!inicio || r.data >= inicio) && (!fim || r.data <= fim) && (!bateria || r.bateria === bateria));
}

// --- Página ---

export async function renderizarItensControle() {
    const temControle = !!controleAtual;
    $('ic_seletor').classList.toggle('compacto', temControle);
    document.querySelectorAll('#ic_seletor .ic_opcao').forEach(b => {
        const ativo = b.dataset.controle === controleAtual;
        b.classList.toggle('ativo', ativo);
        b.setAttribute('aria-selected', String(ativo));
    });
    $('ic_conteudo').hidden = !temControle;
    $('ic_botoes').hidden = !temControle;
    const bateria = bateriaFiltro();
    $('ic_titulo').textContent = ['Itens de Controle', temControle ? CONTROLES[controleAtual].titulo : null, bateria ? `Bateria ${bateria}` : null]
        .filter(Boolean).join(' · ');
    if (!temControle) return;

    $('ic_btn_novo').hidden = !isAdminAtual();
    await carregarControle(controleAtual);
    renderizarTabelaPagina();
}

function renderizarResumo(lista) {
    const cfg = CONTROLES[controleAtual];
    let cards;
    if (cfg.status) {
        const desvios = lista.filter(r => valorDoRegistro(cfg, r, 'status') === 'DESVIO').length;
        cards = [['Lançamentos', lista.length, ''], ['OK', lista.length - desvios, 'concluido'], ['Desvio', desvios, 'nao_reparado']];
    } else if (controleAtual === 'truck') {
        const comNok = lista.filter(r => CAMPOS_TRUCK.some(c => r[c.id] === 'NOK')).length;
        cards = [['Lançamentos', lista.length, ''], ['Sem NOK', lista.length - comNok, 'concluido'], ['Com NOK', comNok, 'nao_reparado']];
    } else {
        const soma = (f) => lista.filter(f).reduce((acc, r) => acc + (Number(r.peso_t) || 0), 0);
        const t = (v) => `${v.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} t`;
        cards = [['Viagens', lista.length, ''], ['Peso total', t(soma(() => true)), 'destaque'],
            ['Cain', t(soma(r => materialDaLinha(r.linha) === 'Cain')), 'em_andamento'],
            ['Moinha', t(soma(r => materialDaLinha(r.linha) === 'Moinha')), 'inspecao']];
    }
    $('ic_resumo').innerHTML = cards.map(([titulo, valor, classe]) =>
        `<div class="card_stat ${classe}"><h3>${esc(titulo)}</h3><p>${esc(valor)}</p></div>`).join('');
}

function renderizarTabelaPagina() {
    const cfg = CONTROLES[controleAtual];
    const lista = dadosDoPeriodo();
    renderizarResumo(lista);
    $('ic_tabela').querySelector('thead').innerHTML = `<tr>${cfg.colunas.map(c => `<th>${esc(c.rotulo)}</th>`).join('')}</tr>`;
    $('ic_tabela').querySelector('tbody').innerHTML = lista.length
        ? lista.map(r => `<tr>${cfg.colunas.map(c => htmlCelula(cfg, r, c)).join('')}</tr>`).join('')
        : `<tr><td colspan="${cfg.colunas.length}" class="ic_vazio">Nenhum lançamento no período.</td></tr>`;
}

// --- Banco de dados (modal) ---

const colunasDoBanco = (cfg) => {
    const base = cfg.colunas.slice();
    // Bateria logo depois da data, quando não está nas colunas principais
    cfg.colunasBanco.forEach(c => { if (!base.some(b => b.campo === c.campo)) base.splice(1, 0, c); });
    return [...base, ...COLS_AUDITORIA];
};

function htmlFiltro(c) {
    if (c.tipo === 'oknok') return `<select class="input_filtro_col" data-filtro="${c.campo}"><option value="">Todos</option><option>OK</option><option>NOK</option><option value="-">Vazio</option></select>`;
    if (c.tipo === 'status') return `<select class="input_filtro_col" data-filtro="${c.campo}"><option value="">Todos</option><option>OK</option><option>DESVIO</option></select>`;
    if (c.campo === 'bateria') return `<select class="input_filtro_col" data-filtro="${c.campo}"><option value="">Todas</option>${BATERIAS.map(b => `<option>${b}</option>`).join('')}</select>`;
    return `<input type="text" class="input_filtro_col" data-filtro="${c.campo}">`;
}

function abrirBanco() {
    const cfg = CONTROLES[controleAtual];
    const cols = colunasDoBanco(cfg);
    $('ic_banco_titulo').textContent = `Banco de Dados - ${cfg.titulo}`;
    $('ic_banco_novo').hidden = !isAdminAtual();
    $('ic_banco_tabela').querySelector('thead').innerHTML =
        `<tr>${cols.map(c => `<th>${esc(c.rotulo)}</th>`).join('')}<th style="width: 80px;">Ações</th></tr>`
        + `<tr class="linha_filtros_tabela">${cols.map(c => `<th>${htmlFiltro(c)}</th>`).join('')}<th></th></tr>`;
    $('ic_banco_inicio').value = '';
    $('ic_banco_fim').value = '';
    // Já abre filtrado na bateria escolhida no menu (dá para trocar no filtro da coluna)
    const filtroBateria = $('ic_banco_tabela').querySelector('select[data-filtro="bateria"]');
    if (filtroBateria) filtroBateria.value = bateriaFiltro() || '';
    renderizarBanco();
    $('modal_ic_banco').classList.add('active');
}

function textoParaFiltro(cfg, reg, c) {
    const v = valorDoRegistro(cfg, reg, c.campo);
    if (v === null || v === undefined || v === '') return '';
    if (c.tipo === 'data') return `${v} ${formatarDataBR(v)}`;
    if (c.tipo === 'datahora') return formatarDataHora(v);
    if (c.tipo === 'numero') return `${v} ${String(v).replace('.', ',')}`;
    return String(v);
}

function renderizarBanco() {
    if (!controleAtual) return;
    const cfg = CONTROLES[controleAtual];
    const cols = colunasDoBanco(cfg);
    const inicio = $('ic_banco_inicio').value;
    const fim = $('ic_banco_fim').value;
    const filtros = [...$('ic_banco_tabela').querySelectorAll('[data-filtro]')].map(el => [el.dataset.filtro, el.value.trim(), el.tagName]);

    const lista = dadosAtuais().filter(r => {
        if (inicio && r.data < inicio) return false;
        if (fim && r.data > fim) return false;
        return filtros.every(([campo, termo, tag]) => {
            if (!termo) return true;
            const c = cols.find(x => x.campo === campo);
            const texto = textoParaFiltro(cfg, r, c);
            if (tag === 'SELECT') return termo === '-' ? texto === '' : texto === termo;
            return texto.toLowerCase().includes(termo.toLowerCase());
        });
    });

    const admin = isAdminAtual();
    $('ic_banco_tabela').querySelector('tbody').innerHTML = lista.length
        ? lista.map(r => `<tr>${cols.map(c => htmlCelula(cfg, r, c)).join('')}<td>${admin ? `<div class="acoes_linha">
            <button class="btn_icone icone_editar" data-acao="editar" data-id="${esc(r.id)}" aria-label="Editar"><svg class="icone" aria-hidden="true"><use href="#i-pencil"></use></svg></button>
            <button class="btn_icone icone_excluir" data-acao="excluir" data-id="${esc(r.id)}" aria-label="Excluir"><svg class="icone" aria-hidden="true"><use href="#i-trash"></use></svg></button>
        </div>` : ''}</td></tr>`).join('')
        : `<tr><td colspan="${cols.length + 1}" class="ic_vazio">Nenhum registro encontrado com os filtros atuais.</td></tr>`;
}

function limparFiltrosBanco() {
    $('ic_banco_tabela').querySelectorAll('[data-filtro]').forEach(el => { el.value = ''; });
    $('ic_banco_inicio').value = '';
    $('ic_banco_fim').value = '';
    renderizarBanco();
}

// --- Excel (período da página) ---

function baixarBanco() {
    if (typeof XLSX === 'undefined') { mostrarToast('A biblioteca de exportação (SheetJS) não carregou. Verifique a conexão.', 'erro', 8000); return; }
    const cfg = CONTROLES[controleAtual];
    const lista = dadosDoPeriodo();
    if (lista.length === 0) { mostrarToast('Nenhum lançamento no período para exportar.', 'info', 6000); return; }
    const cols = colunasDoBanco(cfg);
    const linhas = lista.map(r => cols.map(c => {
        const v = valorDoRegistro(cfg, r, c.campo);
        if (v === null || v === undefined) return '';
        if (c.tipo === 'data') return formatarDataBR(v);
        if (c.tipo === 'datahora') return formatarDataHora(v);
        if (c.tipo === 'numero') return Number(v);
        return v;
    }));
    const planilha = XLSX.utils.aoa_to_sheet([cols.map(c => c.rotulo), ...linhas]);
    planilha['!cols'] = cols.map(c => ({ wch: Math.max(10, Math.min(40, c.rotulo.length + 4)) }));
    const livro = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(livro, planilha, cfg.titulo.slice(0, 31));
    const nomeArquivo = cfg.titulo.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '_').toUpperCase();
    const sufixoBateria = bateriaFiltro() ? `_BATERIA_${bateriaFiltro()}` : '';
    XLSX.writeFile(livro, `${nomeArquivo}${sufixoBateria}_${$('ic_inicio').value || 'INICIO'}_a_${$('ic_fim').value || hojeISO()}.xlsx`);
}

// --- Formulário (modal de lançamento) ---

function opcoesMaquina(bateria) {
    return NUMEROS_MAQUINA.map(n => `${n}${bateria}`);
}

function htmlCampoForm(c) {
    const id = `ic_f_${c.id}`;
    const rotulo = `${c.rotulo}${c.unidade ? ` (${c.unidade})` : ''}`;
    let controle;
    switch (c.tipo) {
        case 'data': controle = `<input type="date" id="${id}">`; break;
        case 'bateria': controle = `<select id="${id}">${BATERIAS.map(b => `<option value="${b}">${b}</option>`).join('')}</select>`; break;
        case 'maquina': controle = `<select id="${id}" data-maquina></select>`; break;
        case 'select': controle = `<select id="${id}"><option value=""></option>${c.opcoes.map(o => `<option value="${o}">${o}</option>`).join('')}</select>`; break;
        case 'numero': controle = `<input type="text" inputmode="decimal" id="${id}" autocomplete="off"${c.faixa ? ` data-faixa="${c.faixa.join(',')}"` : ''}>`; break;
        case 'inteiro': controle = `<input type="number" min="1" step="1" inputmode="numeric" id="${id}">`; break;
        case 'oknok': controle = `<div class="ic_oknok" id="${id}" role="radiogroup" aria-label="${esc(c.rotulo)}">${OKNOK.map(v => `<button type="button" class="ic_pill ic_pill_${v.toLowerCase()}" data-valor="${v}" role="radio" aria-checked="false">${v}</button>`).join('')}</div>`; break;
        case 'derivado': controle = `<input type="text" id="${id}" readonly tabindex="-1" class="ic_derivado">`; break;
        case 'texto': controle = `<textarea id="${id}" rows="3"></textarea>`; break;
        default: controle = `<input type="text" id="${id}">`;
    }
    return `<div class="ic_campo${c.largo ? ' ic_largo' : ''}" data-campo="${c.id}">
        <label for="${id}">${esc(rotulo)}</label>${controle}
        ${c.faixa ? `<small class="ic_faixa">${c.faixa[0]} a ${c.faixa[1]} ${c.unidade || ''}</small>` : ''}
    </div>`;
}

function montarFormulario(cfg) {
    let grupoAtual = null;
    const partes = [];
    cfg.campos.forEach(c => {
        if (c.grupo && c.grupo !== grupoAtual) {
            grupoAtual = c.grupo;
            partes.push(`<p class="label_destaque maquinas_form_secao ic_largo" data-grupo="${esc(c.grupo)}">${esc(c.grupo)}</p>`);
        } else if (!c.grupo && grupoAtual) {
            grupoAtual = null;
        }
        partes.push(htmlCampoForm(c));
    });
    if (cfg.status) partes.push('<div id="ic_status_previa" class="ic_status_previa ic_largo" hidden></div>');
    $('ic_form_campos').innerHTML = `<div class="ic_form_grid">${partes.join('')}</div>`;
}

function valorCampo(c) {
    const el = $(`ic_f_${c.id}`);
    if (!el) return null;
    if (c.tipo === 'oknok') return el.querySelector('.ic_pill.ativo')?.dataset.valor || null;
    if (c.tipo === 'numero') return lerNumero(el.value);
    if (c.tipo === 'inteiro') return el.value === '' ? null : Number(el.value);
    return el.value === '' ? null : el.value;
}

function definirValorCampo(c, valor) {
    const el = $(`ic_f_${c.id}`);
    if (!el) return;
    if (c.tipo === 'oknok') {
        el.querySelectorAll('.ic_pill').forEach(b => {
            const ativo = b.dataset.valor === valor;
            b.classList.toggle('ativo', ativo);
            b.setAttribute('aria-checked', String(ativo));
        });
        return;
    }
    if (c.tipo === 'numero') { el.value = valor === null || valor === undefined ? '' : String(valor).replace('.', ','); return; }
    el.value = valor ?? '';
}

function lerFormulario(cfg) {
    const d = {};
    cfg.campos.forEach(c => { d[c.id] = valorCampo(c); });
    return d;
}

function campoVisivel(c, dados) {
    return !c.visivel || c.visivel(dados);
}

// Atualiza máquinas da bateria, campos visíveis, derivados e prévia de status
function atualizarFormulario() {
    const cfg = CONTROLES[controleAtual];
    const bateria = $('ic_f_bateria').value;
    document.querySelectorAll('#ic_form_campos select[data-maquina]').forEach(sel => {
        const atual = sel.value;
        const opcoes = opcoesMaquina(bateria);
        sel.innerHTML = opcoes.map(m => `<option value="${m}">${m}</option>`).join('');
        // Troca de bateria mantém o número da máquina (31A -> 31B)
        const mesma = opcoes.find(o => atual && o.slice(0, 2) === atual.slice(0, 2));
        sel.value = mesma || opcoes[0];
    });

    const dados = lerFormulario(cfg);
    cfg.campos.forEach(c => {
        const caixa = document.querySelector(`#ic_form_campos [data-campo="${c.id}"]`);
        if (caixa) caixa.hidden = !campoVisivel(c, dados);
        if (c.tipo === 'derivado') $(`ic_f_${c.id}`).value = c.calcular(dados);
        if (c.faixa) {
            const v = dados[c.id];
            $(`ic_f_${c.id}`).classList.toggle('ic_input_fora', Number.isFinite(v) && foraDaFaixa(v, c.faixa));
        }
    });
    // Título de grupo some se todos os campos do grupo estiverem ocultos (ex.: hopper na 33)
    document.querySelectorAll('#ic_form_campos [data-grupo]').forEach(t => {
        const doGrupo = cfg.campos.filter(c => c.grupo === t.dataset.grupo);
        t.hidden = doGrupo.every(c => !campoVisivel(c, dados));
    });

    const previa = $('ic_status_previa');
    if (previa && cfg.status) {
        const status = cfg.status(Object.fromEntries(Object.entries(dados).map(([k, v]) => [k, Number.isNaN(v) ? null : v])));
        previa.hidden = !status;
        previa.className = `ic_status_previa ic_largo ${status === 'DESVIO' ? 'desvio' : 'ok'}`;
        previa.textContent = status ? `Status: ${status}` : '';
    }
}

function abrirFormulario(registro = null) {
    if (!isAdminAtual()) { mostrarToast('Apenas administradores podem lançar ou editar.', 'info', 6000); return; }
    const cfg = CONTROLES[controleAtual];
    registroEmEdicao = registro;
    montarFormulario(cfg);
    $('ic_form_titulo').textContent = cfg.tituloModal;
    $('ic_form_salvar').textContent = registro ? 'Atualizar Registro' : 'Adicionar Registro';

    $('ic_f_data').value = registro?.data || hojeISO();
    $('ic_f_bateria').value = registro?.bateria || bateriaFiltro() || 'A';
    atualizarFormulario();
    if (registro) {
        cfg.campos.forEach(c => { if (!['data', 'bateria'].includes(c.id) && c.tipo !== 'derivado') definirValorCampo(c, registro[c.id]); });
    }
    atualizarFormulario();
    $('modal_ic_banco').classList.remove('active');
    $('modal_ic_form').classList.add('active');
}

function validar(cfg, dados) {
    for (const c of cfg.campos) {
        if (c.opcional || c.tipo === 'derivado' || !campoVisivel(c, dados)) continue;
        const v = dados[c.id];
        if (v === null || v === undefined || v === '') return { campo: c, msg: `Preencha "${c.rotulo}".` };
        if (c.tipo === 'numero' && (Number.isNaN(v) || v < 0)) return { campo: c, msg: `"${c.rotulo}" precisa ser um número (ex.: 12,5).` };
        if (c.tipo === 'inteiro' && (!Number.isInteger(v) || v < 1)) return { campo: c, msg: `"${c.rotulo}" precisa ser um número inteiro maior que zero.` };
    }
    if (cfg.campos.some(c => c.id === 'peso_t') && !(dados.peso_t > 0)) return { campo: cfg.campos.find(c => c.id === 'peso_t'), msg: 'O peso precisa ser maior que zero.' };
    return null;
}

async function salvarFormulario() {
    const cfg = CONTROLES[controleAtual];
    const dados = lerFormulario(cfg);
    const erro = validar(cfg, dados);
    if (erro) {
        const el = $(`ic_f_${erro.campo.id}`);
        el?.classList.add('invalido');
        el?.focus?.();
        mostrarToast(erro.msg, 'info', 6000);
        return;
    }

    // Só colunas do banco; campos ocultos (ex.: hopper na 33) vão nulos; derivados são calculados no banco
    const payload = {};
    cfg.campos.forEach(c => {
        if (c.tipo === 'derivado') return;
        payload[c.id] = campoVisivel(c, dados) ? dados[c.id] : null;
    });
    payload.observacao = (payload.observacao || '').trim().toUpperCase() || null;

    const botao = $('ic_form_salvar');
    botao.disabled = true;
    try {
        const lista = cache[controleAtual].dados;
        if (registroEmEdicao) {
            payload.atualizado_por = nomeExibicaoAtual();
            payload.atualizado_em = new Date().toISOString();
            const salvo = await atualizarControleSupabase(cfg.tabela, registroEmEdicao.id, payload);
            const i = lista.findIndex(r => String(r.id) === String(registroEmEdicao.id));
            if (i !== -1) lista[i] = salvo || { ...lista[i], ...payload };
        } else {
            payload.registrado_por = nomeExibicaoAtual();
            const salvo = await criarControleSupabase(cfg.tabela, payload);
            lista.push(salvo || { ...payload, id: Date.now(), criado_em: new Date().toISOString() });
        }
        $('modal_ic_form').classList.remove('active');
        mostrarToast(registroEmEdicao ? 'Registro atualizado.' : 'Lançamento salvo.', 'sucesso');
        registroEmEdicao = null;
        renderizarTabelaPagina();
        if ($('modal_ic_banco').classList.contains('active')) renderizarBanco();
    } catch (e) {
        console.error('Erro ao salvar item de controle:', e);
        mostrarToast(`Não foi possível salvar no Supabase.\n${e.message}`, 'erro', 8000);
    } finally {
        botao.disabled = false;
    }
}

async function excluirRegistro(id) {
    if (!isAdminAtual()) return;
    const cfg = CONTROLES[controleAtual];
    if (!confirm('Deseja excluir este registro?')) return;
    try {
        await excluirControleSupabase(cfg.tabela, id);
        cache[controleAtual].dados = cache[controleAtual].dados.filter(r => String(r.id) !== String(id));
        renderizarBanco();
        renderizarTabelaPagina();
        mostrarToast('Registro excluído.', 'sucesso');
    } catch (e) {
        console.error('Erro ao excluir item de controle:', e);
        mostrarToast(`Não foi possível excluir no Supabase.\n${e.message}`, 'erro', 8000);
    }
}

// --- Inicialização ---

export function initItensControle() {
    if (!$('itens_controle')) return;

    $('ic_inicio').value = hojeISO(-30);
    $('ic_fim').value = hojeISO();
    ['ic_inicio', 'ic_fim'].forEach(id => $(id).addEventListener('change', () => controleAtual && renderizarTabelaPagina()));

    $('ic_seletor').addEventListener('click', (e) => {
        const botao = e.target.closest('.ic_opcao');
        if (!botao) return;
        controleAtual = botao.dataset.controle;
        renderizarItensControle();
    });

    $('ic_btn_novo').addEventListener('click', () => abrirFormulario());
    $('ic_btn_abrir_banco').addEventListener('click', abrirBanco);
    $('ic_btn_baixar').addEventListener('click', baixarBanco);

    // Modal de lançamento
    $('ic_form_fechar').addEventListener('click', () => $('modal_ic_form').classList.remove('active'));
    $('ic_form_cancelar').addEventListener('click', () => $('modal_ic_form').classList.remove('active'));
    $('ic_form_salvar').addEventListener('click', salvarFormulario);
    $('ic_form_campos').addEventListener('change', (e) => {
        if (e.target.id === 'ic_f_bateria' || e.target.matches('select[data-maquina]')) atualizarFormulario();
    });
    $('ic_form_campos').addEventListener('input', (e) => { e.target.classList?.remove('invalido'); atualizarFormulario(); });
    $('ic_form_campos').addEventListener('click', (e) => {
        const pill = e.target.closest('.ic_pill');
        if (!pill) return;
        const grupo = pill.closest('.ic_oknok');
        const jaAtivo = pill.classList.contains('ativo');
        grupo.querySelectorAll('.ic_pill').forEach(b => { b.classList.remove('ativo'); b.setAttribute('aria-checked', 'false'); });
        if (!jaAtivo) { pill.classList.add('ativo'); pill.setAttribute('aria-checked', 'true'); }
        grupo.classList.remove('invalido');
    });

    // Modal do banco
    $('ic_banco_fechar').addEventListener('click', () => $('modal_ic_banco').classList.remove('active'));
    $('ic_banco_limpar').addEventListener('click', limparFiltrosBanco);
    $('ic_banco_novo').addEventListener('click', () => abrirFormulario());
    ['ic_banco_inicio', 'ic_banco_fim'].forEach(id => $(id).addEventListener('change', renderizarBanco));
    $('ic_banco_tabela').addEventListener('input', debounce((e) => { if (e.target.matches('input[data-filtro]')) renderizarBanco(); }));
    $('ic_banco_tabela').addEventListener('change', (e) => { if (e.target.matches('select[data-filtro]')) renderizarBanco(); });
    $('ic_banco_tabela').addEventListener('click', (e) => {
        const botao = e.target.closest('button[data-acao]');
        if (!botao) return;
        const reg = cache[controleAtual]?.dados.find(r => String(r.id) === String(botao.dataset.id));
        if (botao.dataset.acao === 'editar' && reg) abrirFormulario(reg);
        if (botao.dataset.acao === 'excluir') excluirRegistro(botao.dataset.id);
    });

    // Sessão: ao sair, nada fica em memória; mudança de permissão redesenha
    window.addEventListener('sessao:encerrada', () => {
        Object.keys(cache).forEach(k => delete cache[k]);
        controleAtual = null;
        renderizarItensControle();
    });
    window.addEventListener('sessao:perfil', () => { Object.keys(cache).forEach(k => { cache[k].carregado = false; }); if (controleAtual) renderizarItensControle(); });
}
