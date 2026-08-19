// =========================================================
// --- 5. TABELA DE DADOS & FILTROS ---
// =========================================================
import { state, isAdminAtual } from './state.js';
import { formatarStatus, formatarDataBR, definirValorSelect, calcularSituacaoPrazo } from './utils.js';
import { init3D } from './twin3d.js';

let modalTabela, tbodyBanco;
let fData, fId, fStatus, fBateria, fBloco, fForno, fLado, fProblema, fObservacao, fPrazo, fFim, fSituacao, fCriadoPor;

function textoContem(valorCampo, termoFiltro) {
    if (!termoFiltro) return true;
    return String(valorCampo || '').toLowerCase().includes(termoFiltro.trim().toLowerCase());
}

export function obterRegistrosFiltradosTabela() {
    let filtrados = state.dbReparos.slice().reverse();

    if (fStatus.value !== 'Todos') filtrados = filtrados.filter(r => r.andamento === fStatus.value);
    if (fBateria.value !== 'Todas') filtrados = filtrados.filter(r => r.bateria === fBateria.value);
    if (fBloco.value !== 'Todos') filtrados = filtrados.filter(r => String(r.bloco) === fBloco.value);
    if (fForno.value !== 'Todos') filtrados = filtrados.filter(r => r.forno === fForno.value);
    if (fLado.value !== 'Todos') filtrados = filtrados.filter(r => r.lado === fLado.value);
    if (fSituacao.value !== 'Todos') filtrados = filtrados.filter(r => calcularSituacaoPrazo(r).codigo === fSituacao.value);

    filtrados = filtrados.filter(r => textoContem(r.data_registro, fData.value));
    filtrados = filtrados.filter(r => textoContem(r.id_referencia, fId.value));
    filtrados = filtrados.filter(r => textoContem(r.desc_problema, fProblema.value));
    filtrados = filtrados.filter(r => textoContem(r.observacao, fObservacao.value));
    filtrados = filtrados.filter(r => textoContem(formatarDataBR(r.prazo), fPrazo.value));
    filtrados = filtrados.filter(r => textoContem(formatarDataBR(r.data_fim), fFim.value));
    filtrados = filtrados.filter(r => textoContem(r.criado_por, fCriadoPor.value));

    return filtrados;
}

export function renderizarTabela() {
    tbodyBanco.innerHTML = '';
    const filtrados = obterRegistrosFiltradosTabela();

    if (filtrados.length === 0) {
        tbodyBanco.innerHTML = '<tr><td colspan="14" style="text-align:center; color:#888; padding:24px;">Nenhum registro encontrado com os filtros atuais.</td></tr>';
        return;
    }

    filtrados.forEach(reg => {
        const tr = document.createElement('tr');
        const situacao = calcularSituacaoPrazo(reg);

        tr.innerHTML = `
            <td><strong>${reg.data_registro}</strong></td>
            <td style="color: rgb(225, 51, 0); font-weight: bold;">${reg.id_referencia}</td>
            <td>${formatarStatus(reg.andamento)}</td>
            <td>${reg.bateria}</td>
            <td>${reg.bloco}</td>
            <td>${reg.forno}</td>
            <td>${reg.lado}</td>
            <td>${reg.desc_problema || '-'}</td>
            <td>${reg.observacao || '-'}</td>
            <td>${formatarDataBR(reg.prazo)}</td>
            <td>${formatarDataBR(reg.data_fim)}</td>
            <td><span class="badge_prazo ${situacao.classe}">${situacao.texto}</span></td>
            <td>${reg.criado_por || '-'}</td>
            <td>
                ${isAdminAtual() ? `
                <button onclick="abrirEdicaoPelaTabela('${reg.id_reparo}')" title="Editar">✏️</button>
                <button onclick="deletarRegistro('${reg.id_reparo}')" title="Excluir">🗑️</button>
                ` : '<span style="color:#aaa;">🔒</span>'}
            </td>
        `;
        tbodyBanco.appendChild(tr);
    });
}

function limparFiltrosTabela() {
    fData.value = ''; fId.value = ''; fProblema.value = ''; fObservacao.value = '';
    fPrazo.value = ''; fFim.value = ''; fCriadoPor.value = '';
    fStatus.value = 'Todos'; fBateria.value = 'Todas'; fBloco.value = 'Todos';
    fForno.value = 'Todos'; fLado.value = 'Todos'; fSituacao.value = 'Todos';
    renderizarTabela();
}

export function initTabela() {
    modalTabela = document.getElementById('modal_tabela');
    tbodyBanco = document.getElementById('tbody_banco');

    fData = document.getElementById('ftab_data');
    fId = document.getElementById('ftab_id');
    fStatus = document.getElementById('ftab_status');
    fBateria = document.getElementById('ftab_bateria');
    fBloco = document.getElementById('ftab_bloco');
    fForno = document.getElementById('ftab_forno');
    fLado = document.getElementById('ftab_lado');
    fProblema = document.getElementById('ftab_problema');
    fObservacao = document.getElementById('ftab_observacao');
    fPrazo = document.getElementById('ftab_prazo');
    fFim = document.getElementById('ftab_fim');
    fSituacao = document.getElementById('ftab_situacao');
    fCriadoPor = document.getElementById('ftab_criado_por');

    // Preenche o select de forno do filtro (mesmo padrão "01".."18" usado no resto do app)
    for (let i = 1; i <= 18; i++) {
        const f = i.toString().padStart(2, '0');
        fForno.innerHTML += `<option value="${f}">${f}</option>`;
    }
    fForno.innerHTML += `<option value="N/A">N/A (Coletor sem forno)</option>`;

    document.getElementById('btn_abrir_tabela').addEventListener('click', () => { renderizarTabela(); modalTabela.classList.add('active'); });
    document.getElementById('fechar_modal_tabela').addEventListener('click', () => modalTabela.classList.remove('active'));

    document.getElementById('btn_novo_tabela').addEventListener('click', () => {
        modalTabela.classList.remove('active');
        document.getElementById('btn_abrir_manual').click();
    });

    document.getElementById('btn_limpar_filtros_tabela').addEventListener('click', limparFiltrosTabela);

    // Selects filtram no "change"; campos de texto filtram a cada tecla ("input")
    [fStatus, fBateria, fBloco, fForno, fLado, fSituacao].forEach(el => el.addEventListener('change', renderizarTabela));
    [fData, fId, fProblema, fObservacao, fPrazo, fFim, fCriadoPor].forEach(el => el.addEventListener('input', renderizarTabela));

    window.abrirEdicaoPelaTabela = function (idReparo) {
        if (!isAdminAtual()) { alert('Apenas usuários administradores podem editar reparos.'); return; }
        modalTabela.classList.remove('active');
        const reg = state.dbReparos.find(r => r.id_reparo == idReparo);
        if (reg) {
            document.getElementById('sel_bat').value = reg.bateria; document.getElementById('sel_bloco').value = reg.bloco;
            document.getElementById('sel_forno').value = reg.forno;
            definirValorSelect(document.getElementById('sel_lado'), reg.lado);
            definirValorSelect(document.getElementById('sel_tipo'), reg.reparo_no);

            document.getElementById('sel_tipo').dispatchEvent(new Event('change'));

            // Abre o modal ANTES de inicializar o 3D/carregar o registro: init3D()
            // precisa do container já visível, e atualizarAlvoVisual() (chamado
            // dentro de editarRegistro) depende da cena 3D já existir. Fazer isso
            // fora de ordem lançava um erro e o modal nunca chegava a abrir.
            document.getElementById("modal_reparo").classList.add("active");
            setTimeout(() => {
                init3D();
                window.editarRegistro(idReparo);
            }, 100);
        }
    };
}