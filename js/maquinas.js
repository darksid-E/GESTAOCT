// =========================================================
// --- PÁGINA "MÁQUINAS" (lançamentos de altura/perfil de carga) ---
// =========================================================
import { state, isAdminAtual, nomeExibicaoAtual, salvarCacheLocalMaquinas } from './state.js';
import { criarMaquinaSupabase, atualizarMaquinaSupabase, excluirMaquinaSupabase } from './supabase-api.js';
import { formatarDataBR } from './utils.js';

// Os 8 pontos de medição da bandeja, na ordem em que aparecem no
// modal — usados tanto pra montar/ler o formulário quanto pra tirar a
// média em cada célula do diagrama.
const CAMPOS_BANDEJA = [
    'frontal_dir', 'frontal_esq',
    'centro_dir', 'centro_1_dir_esq',
    'centro_esq', 'centro_2_dir_esq',
    'traseira_dir', 'traseira_esq',
];

const MAQUINAS_POR_BATERIA = { A: ['31A', '32A'], B: ['31B', '32B'], C: ['31C', '32C'] };

let modalMaquina, modalTabelaMaquinas, tbodyBancoMaquinas;
let fDataM, fBateriaM, fBlocoM, fFornoM, fMaquinaM, fGatilhoM, fRegistradoPorM;

function textoContem(valorCampo, termoFiltro) {
    if (!termoFiltro) return true;
    return String(valorCampo || '').toLowerCase().includes(termoFiltro.trim().toLowerCase());
}

function atualizarOpcoesMaquinaPorBateria() {
    const bateria = document.getElementById('maquina_bateria').value;
    const selectMaquina = document.getElementById('maquina_maquina');
    const opcoes = MAQUINAS_POR_BATERIA[bateria] || [];
    const valorAtual = selectMaquina.value;
    selectMaquina.innerHTML = opcoes.map(m => `<option value="${m}">${m}</option>`).join('');
    if (opcoes.includes(valorAtual)) selectMaquina.value = valorAtual;
}

function limparFormularioMaquina() {
    document.getElementById('maquina_id_edit').value = '';
    document.getElementById('maquina_data').value = new Date().toISOString().split('T')[0];
    document.getElementById('maquina_bateria').value = 'A';
    atualizarOpcoesMaquinaPorBateria();
    document.getElementById('maquina_bloco').value = '1';
    document.getElementById('maquina_forno').value = '01';
    document.getElementById('maquina_altura_programada').value = '900';
    document.getElementById('maquina_perfil_carga').value = 'normal 1';
    CAMPOS_BANDEJA.forEach(c => { document.getElementById(`maquina_${c}`).value = ''; });
    document.getElementById('maquina_tempo_compactacao').value = '';
    document.getElementById('maquina_pressao_compactacao').value = '';
    document.getElementById('maquina_nivel_oleo').value = '';
    document.getElementById('maquina_nivel_bacia').value = '';
    document.getElementById('maquina_observacao').value = '';
    document.getElementById('btn_salvar_maquina').innerText = 'Adicionar Registro';
    document.getElementById('btn_cancelar_edicao_maquina').style.display = 'none';
}

function abrirModalNovaMaquina() {
    if (!isAdminAtual()) { alert('Apenas usuários administradores podem lançar novos registros de máquina.'); return; }
    limparFormularioMaquina();
    modalMaquina.classList.add('active');
}

// Calcula altura_media/desvio/gatilho no próprio navegador — só usado
// quando o Supabase está fora do ar (modo offline com cache local); com
// o Supabase ativo é a trigger do banco que calcula isso de verdade.
function calcularIndicadoresLocal(dados) {
    const soma = CAMPOS_BANDEJA.reduce((acc, c) => acc + Number(dados[c] || 0), 0);
    const alturaMedia = Math.round((1300 - (soma / 8) * 10) * 100) / 100;
    const desvio = Math.round((alturaMedia - dados.altura_programada) * 100) / 100;
    const gatilho = Math.abs(desvio) > 30 ? 'DESVIO' : 'OK';
    return { altura_media: alturaMedia, desvio, gatilho };
}

function validarFormularioMaquina(dados) {
    for (const c of CAMPOS_BANDEJA) {
        if (!Number.isFinite(dados[c]) || dados[c] < 10 || dados[c] > 60) {
            return `Todas as medições da bandeja precisam ser um número entre 10 e 60 (campo inválido: ${c.replace(/_/g, ' ')}).`;
        }
    }
    if (!Number.isFinite(dados.nivel_oleo_pct) || dados.nivel_oleo_pct < 0 || dados.nivel_oleo_pct > 100) {
        return 'O nível do óleo precisa ser um número entre 0 e 100%.';
    }
    if (!Number.isFinite(dados.nivel_bacia_pct) || dados.nivel_bacia_pct < 0 || dados.nivel_bacia_pct > 100) {
        return 'O nível da bacia precisa ser um número entre 0 e 100%.';
    }
    if (!Number.isFinite(dados.tempo_compactacao_min) || dados.tempo_compactacao_min <= 0) {
        return 'Informe o tempo de compactação (minutos).';
    }
    if (!Number.isFinite(dados.pressao_compactacao_bar) || dados.pressao_compactacao_bar <= 0) {
        return 'Informe a pressão de compactação (bar).';
    }
    return null;
}

window.editarRegistroMaquina = function (id) {
    if (!isAdminAtual()) { alert('Apenas usuários administradores podem editar registros de máquina.'); return; }
    const reg = state.dbMaquinas.find(m => String(m.id) === String(id));
    if (!reg) return;

    document.getElementById('maquina_id_edit').value = reg.id;
    document.getElementById('maquina_data').value = reg.data;
    document.getElementById('maquina_bateria').value = reg.bateria;
    atualizarOpcoesMaquinaPorBateria();
    document.getElementById('maquina_bloco').value = String(reg.bloco);
    document.getElementById('maquina_forno').value = String(reg.forno).padStart(2, '0');
    document.getElementById('maquina_maquina').value = reg.maquina;
    document.getElementById('maquina_altura_programada').value = String(reg.altura_programada);
    document.getElementById('maquina_perfil_carga').value = reg.perfil_carga;
    CAMPOS_BANDEJA.forEach(c => { document.getElementById(`maquina_${c}`).value = reg[c]; });
    document.getElementById('maquina_tempo_compactacao').value = reg.tempo_compactacao_min;
    document.getElementById('maquina_pressao_compactacao').value = reg.pressao_compactacao_bar;
    document.getElementById('maquina_nivel_oleo').value = reg.nivel_oleo_pct;
    document.getElementById('maquina_nivel_bacia').value = reg.nivel_bacia_pct;
    document.getElementById('maquina_observacao').value = reg.observacao || '';
    document.getElementById('btn_salvar_maquina').innerText = 'Atualizar Registro';
    document.getElementById('btn_cancelar_edicao_maquina').style.display = 'block';

    modalTabelaMaquinas.classList.remove('active');
    modalMaquina.classList.add('active');
};

window.deletarRegistroMaquina = async function (id) {
    if (!isAdminAtual()) { alert('Apenas usuários administradores podem excluir registros de máquina.'); return; }
    if (!confirm('Deseja excluir este registro?')) return;

    try {
        if (state.supabaseAtivo) await excluirMaquinaSupabase(id);
        state.dbMaquinas = state.dbMaquinas.filter(m => String(m.id) !== String(id));
        salvarCacheLocalMaquinas();
        renderizarPaginaMaquinas();
        renderizarTabelaMaquinas();
    } catch (erro) {
        console.error('Erro ao excluir registro de máquina:', erro);
        alert(`Não foi possível excluir no Supabase.\n${erro.message}`);
    }
};

// --- Diagrama conceitual da bandeja + indicadores do período ---

function obterRegistrosNoPeriodo() {
    const inicio = document.getElementById('maquinas_filtro_data_inicio').value;
    const fim = document.getElementById('maquinas_filtro_data_fim').value;
    return state.dbMaquinas.filter(r => {
        if (inicio && r.data < inicio) return false;
        if (fim && r.data > fim) return false;
        return true;
    });
}

function mediaCampo(lista, campo) {
    if (lista.length === 0) return null;
    const soma = lista.reduce((acc, r) => acc + Number(r[campo] || 0), 0);
    return soma / lista.length;
}

export function aplicarFiltroBateriaMaquinas() {
    const filtroBat = state.filtroBateriaMaquinas || 'Todas';
    document.querySelectorAll('.maquinas_bateria_bloco').forEach(bloco => {
        const visivel = filtroBat === 'Todas' || bloco.dataset.bateria === filtroBat;
        bloco.style.display = visivel ? '' : 'none';
    });
}

export function renderizarPaginaMaquinas() {
    const filtrados = obterRegistrosNoPeriodo();

    document.querySelectorAll('.maquinas_card').forEach(card => {
        const codigoMaquina = card.dataset.maquina;
        const registrosDaMaquina = filtrados.filter(r => r.maquina === codigoMaquina);

        CAMPOS_BANDEJA.forEach(campo => {
            const span = card.querySelector(`span[data-campo="${campo}"]`);
            if (!span) return;
            const media = mediaCampo(registrosDaMaquina, campo);
            span.textContent = media === null ? '-' : media.toFixed(1);
        });

        const alturaMediaMaquina = mediaCampo(registrosDaMaquina, 'altura_media');
        const indicadorAltura = card.querySelector('strong[data-indicador="altura_media"]');
        if (indicadorAltura) indicadorAltura.textContent = alturaMediaMaquina === null ? '-' : `${alturaMediaMaquina.toFixed(1)} mm`;

        const totalMaquina = registrosDaMaquina.length;
        const totalOkMaquina = registrosDaMaquina.filter(r => r.gatilho === 'OK').length;
        const indicadorAderencia = card.querySelector('strong[data-indicador="aderencia"]');
        if (indicadorAderencia) {
            indicadorAderencia.textContent = totalMaquina === 0 ? '-' : `${Math.round((totalOkMaquina / totalMaquina) * 100)}% (${totalOkMaquina}/${totalMaquina})`;
        }
    });

    aplicarFiltroBateriaMaquinas();
}

// --- Tabela de dados (modal) ---

function obterRegistrosFiltradosTabelaMaquinas() {
    let filtrados = state.dbMaquinas.slice().sort((a, b) => (b.id || 0) - (a.id || 0));

    if (fBateriaM.value !== 'Todas') filtrados = filtrados.filter(r => r.bateria === fBateriaM.value);
    if (fBlocoM.value !== 'Todos') filtrados = filtrados.filter(r => String(r.bloco) === fBlocoM.value);
    if (fFornoM.value !== 'Todos') filtrados = filtrados.filter(r => String(r.forno).padStart(2, '0') === fFornoM.value);
    if (fMaquinaM.value !== 'Todas') filtrados = filtrados.filter(r => r.maquina === fMaquinaM.value);
    if (fGatilhoM.value !== 'Todos') filtrados = filtrados.filter(r => r.gatilho === fGatilhoM.value);

    filtrados = filtrados.filter(r => textoContem(r.data, fDataM.value));
    filtrados = filtrados.filter(r => textoContem(r.registrado_por, fRegistradoPorM.value));

    return filtrados;
}

export function renderizarTabelaMaquinas() {
    if (!tbodyBancoMaquinas) return;
    tbodyBancoMaquinas.innerHTML = '';
    const filtrados = obterRegistrosFiltradosTabelaMaquinas();

    if (filtrados.length === 0) {
        tbodyBancoMaquinas.innerHTML = '<tr><td colspan="12" style="text-align:center; color:#888; padding:24px;">Nenhum registro encontrado com os filtros atuais.</td></tr>';
        return;
    }

    filtrados.forEach(reg => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><strong>${formatarDataBR(reg.data)}</strong></td>
            <td>${reg.bateria}</td>
            <td>${reg.bloco}</td>
            <td>${String(reg.forno).padStart(2, '0')}</td>
            <td>${reg.maquina}</td>
            <td>${reg.altura_programada}</td>
            <td>${reg.perfil_carga}</td>
            <td>${reg.altura_media ?? '-'}</td>
            <td>${reg.desvio ?? '-'}</td>
            <td><span class="badge_prazo ${reg.gatilho === 'DESVIO' ? 'prazo_atrasado' : 'prazo_ok'}">${reg.gatilho || '-'}</span></td>
            <td>${reg.registrado_por || '-'}</td>
            <td>
                ${isAdminAtual() ? `
                <button onclick="editarRegistroMaquina('${reg.id}')" title="Editar">✏️</button>
                <button onclick="deletarRegistroMaquina('${reg.id}')" title="Excluir">🗑️</button>
                ` : '<span style="color:#aaa;">🔒</span>'}
            </td>
        `;
        tbodyBancoMaquinas.appendChild(tr);
    });
}

function limparFiltrosTabelaMaquinas() {
    fDataM.value = ''; fRegistradoPorM.value = '';
    fBateriaM.value = 'Todas'; fBlocoM.value = 'Todos'; fFornoM.value = 'Todos';
    fMaquinaM.value = 'Todas'; fGatilhoM.value = 'Todos';
    renderizarTabelaMaquinas();
}

// --- Exportação em Excel (usa o mesmo período do diagrama) ---

function exportarExcelMaquinas() {
    if (typeof XLSX === 'undefined') {
        alert('A biblioteca de exportação (SheetJS) não carregou. Verifique sua conexão e tente de novo.');
        return;
    }

    const registros = obterRegistrosNoPeriodo();
    if (registros.length === 0) {
        alert('Nenhum registro encontrado no período selecionado.');
        return;
    }

    const linhas = registros.map(r => ({
        Data: formatarDataBR(r.data),
        Bateria: r.bateria,
        Bloco: r.bloco,
        Forno: String(r.forno).padStart(2, '0'),
        Máquina: r.maquina,
        'Altura Programada': r.altura_programada,
        'Perfil de Carga': r.perfil_carga,
        'Frontal Dir.': r.frontal_dir,
        'Frontal Esq.': r.frontal_esq,
        'Centro Dir.': r.centro_dir,
        'Centro 1 Dir.Esq.': r.centro_1_dir_esq,
        'Centro Esq.': r.centro_esq,
        'Centro 2 Dir.Esq.': r.centro_2_dir_esq,
        'Traseira Dir.': r.traseira_dir,
        'Traseira Esq.': r.traseira_esq,
        'Altura Média': r.altura_media,
        Desvio: r.desvio,
        Gatilho: r.gatilho,
        'Tempo Compactação (min)': r.tempo_compactacao_min,
        'Pressão Compactação (bar)': r.pressao_compactacao_bar,
        'Nível Óleo (%)': r.nivel_oleo_pct,
        'Nível Bacia (%)': r.nivel_bacia_pct,
        Observação: r.observacao,
        'Registrado Por': r.registrado_por,
    }));

    const planilha = XLSX.utils.json_to_sheet(linhas);
    const livro = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(livro, planilha, 'Máquinas');

    const inicio = document.getElementById('maquinas_filtro_data_inicio').value;
    const fim = document.getElementById('maquinas_filtro_data_fim').value;
    const sufixo = (inicio || fim) ? `_${inicio || 'inicio'}_a_${fim || 'hoje'}` : '_todos';
    XLSX.writeFile(livro, `maquinas${sufixo}.xlsx`);
}

// --- Inicialização ---

export function initMaquinas() {
    modalMaquina = document.getElementById('modal_maquina');
    modalTabelaMaquinas = document.getElementById('modal_tabela_maquinas');
    tbodyBancoMaquinas = document.getElementById('tbody_banco_maquinas');

    fDataM = document.getElementById('ftabm_data');
    fBateriaM = document.getElementById('ftabm_bateria');
    fBlocoM = document.getElementById('ftabm_bloco');
    fFornoM = document.getElementById('ftabm_forno');
    fMaquinaM = document.getElementById('ftabm_maquina');
    fGatilhoM = document.getElementById('ftabm_gatilho');
    fRegistradoPorM = document.getElementById('ftabm_registrado_por');

    // Selects de forno (modal e filtro da tabela), padrão "01".."18" do resto do app
    const selForno = document.getElementById('maquina_forno');
    for (let i = 1; i <= 18; i++) {
        const f = i.toString().padStart(2, '0');
        selForno.innerHTML += `<option value="${f}">${f}</option>`;
        fFornoM.innerHTML += `<option value="${f}">${f}</option>`;
    }

    document.getElementById('maquina_bateria').addEventListener('change', atualizarOpcoesMaquinaPorBateria);
    atualizarOpcoesMaquinaPorBateria();

    document.getElementById('maquinas_filtro_bat').addEventListener('change', (e) => {
        state.filtroBateriaMaquinas = e.target.value;
        aplicarFiltroBateriaMaquinas();
    });

    // Período do diagrama/exportação — padrão: hoje
    const hoje = new Date().toISOString().split('T')[0];
    const inputInicio = document.getElementById('maquinas_filtro_data_inicio');
    const inputFim = document.getElementById('maquinas_filtro_data_fim');
    inputInicio.value = hoje;
    inputFim.value = hoje;
    inputInicio.addEventListener('change', renderizarPaginaMaquinas);
    inputFim.addEventListener('change', renderizarPaginaMaquinas);

    document.getElementById('btn_abrir_manual_maquina').addEventListener('click', abrirModalNovaMaquina);
    document.getElementById('fechar_modal_maquina').addEventListener('click', () => modalMaquina.classList.remove('active'));
    modalMaquina.addEventListener('click', (e) => { if (e.target === modalMaquina) modalMaquina.classList.remove('active'); });
    document.getElementById('btn_cancelar_edicao_maquina').addEventListener('click', limparFormularioMaquina);

    document.getElementById('btn_baixar_excel_maquinas').addEventListener('click', exportarExcelMaquinas);

    document.getElementById('btn_abrir_tabela_maquinas').addEventListener('click', () => {
        renderizarTabelaMaquinas();
        modalTabelaMaquinas.classList.add('active');
    });
    document.getElementById('fechar_modal_tabela_maquinas').addEventListener('click', () => modalTabelaMaquinas.classList.remove('active'));
    document.getElementById('btn_novo_tabela_maquina').addEventListener('click', () => {
        modalTabelaMaquinas.classList.remove('active');
        abrirModalNovaMaquina();
    });
    document.getElementById('btn_limpar_filtros_tabela_maquinas').addEventListener('click', limparFiltrosTabelaMaquinas);

    [fBateriaM, fBlocoM, fFornoM, fMaquinaM, fGatilhoM].forEach(el => el.addEventListener('change', renderizarTabelaMaquinas));
    [fDataM, fRegistradoPorM].forEach(el => el.addEventListener('input', renderizarTabelaMaquinas));

    document.getElementById('btn_salvar_maquina').addEventListener('click', async () => {
        if (!isAdminAtual()) { alert('Apenas usuários administradores podem lançar ou editar registros de máquina.'); return; }
        const botaoSalvar = document.getElementById('btn_salvar_maquina');
        const idEdit = document.getElementById('maquina_id_edit').value;

        const dadosForm = {
            data: document.getElementById('maquina_data').value,
            bateria: document.getElementById('maquina_bateria').value,
            bloco: Number(document.getElementById('maquina_bloco').value),
            forno: Number(document.getElementById('maquina_forno').value),
            maquina: document.getElementById('maquina_maquina').value,
            altura_programada: Number(document.getElementById('maquina_altura_programada').value),
            perfil_carga: document.getElementById('maquina_perfil_carga').value,
            frontal_dir: Number(document.getElementById('maquina_frontal_dir').value),
            frontal_esq: Number(document.getElementById('maquina_frontal_esq').value),
            centro_dir: Number(document.getElementById('maquina_centro_dir').value),
            centro_1_dir_esq: Number(document.getElementById('maquina_centro_1_dir_esq').value),
            centro_esq: Number(document.getElementById('maquina_centro_esq').value),
            centro_2_dir_esq: Number(document.getElementById('maquina_centro_2_dir_esq').value),
            traseira_dir: Number(document.getElementById('maquina_traseira_dir').value),
            traseira_esq: Number(document.getElementById('maquina_traseira_esq').value),
            tempo_compactacao_min: Number(document.getElementById('maquina_tempo_compactacao').value),
            pressao_compactacao_bar: Number(document.getElementById('maquina_pressao_compactacao').value),
            nivel_oleo_pct: Number(document.getElementById('maquina_nivel_oleo').value),
            nivel_bacia_pct: Number(document.getElementById('maquina_nivel_bacia').value),
            observacao: document.getElementById('maquina_observacao').value.toUpperCase(),
        };

        if (!dadosForm.data) { alert('Informe a data do lançamento.'); return; }

        const erroValidacao = validarFormularioMaquina(dadosForm);
        if (erroValidacao) { alert(erroValidacao); return; }

        botaoSalvar.disabled = true;
        botaoSalvar.innerText = 'Salvando...';

        try {
            if (state.supabaseAtivo) {
                if (idEdit) {
                    const atualizado = await atualizarMaquinaSupabase(idEdit, dadosForm);
                    const index = state.dbMaquinas.findIndex(m => String(m.id) === String(idEdit));
                    if (index !== -1) state.dbMaquinas[index] = atualizado || { ...state.dbMaquinas[index], ...dadosForm };
                } else {
                    const novoRegistro = { registrado_por: nomeExibicaoAtual(), ...dadosForm };
                    const salvo = await criarMaquinaSupabase(novoRegistro);
                    state.dbMaquinas.push(salvo || novoRegistro);
                }
            } else {
                // Sem Supabase: calcula os indicadores no próprio navegador,
                // já que a trigger que faria isso não vai rodar.
                const indicadores = calcularIndicadoresLocal(dadosForm);
                if (idEdit) {
                    const index = state.dbMaquinas.findIndex(m => String(m.id) === String(idEdit));
                    if (index !== -1) state.dbMaquinas[index] = { ...state.dbMaquinas[index], ...dadosForm, ...indicadores };
                } else {
                    state.dbMaquinas.push({
                        id: Date.now(),
                        registrado_por: nomeExibicaoAtual(),
                        ...dadosForm,
                        ...indicadores,
                    });
                }
            }

            salvarCacheLocalMaquinas();
            limparFormularioMaquina();
            modalMaquina.classList.remove('active');
            renderizarPaginaMaquinas();
            renderizarTabelaMaquinas();
        } catch (erro) {
            console.error('Erro ao salvar registro de máquina:', erro);
            alert(`Não foi possível salvar no Supabase.\n${erro.message}`);
            botaoSalvar.innerText = idEdit ? 'Atualizar Registro' : 'Adicionar Registro';
        } finally {
            botaoSalvar.disabled = false;
        }
    });
}
