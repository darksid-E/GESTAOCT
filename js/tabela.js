// =========================================================
// --- 5. TABELA DE DADOS & FILTROS ---
// =========================================================
import { state, isAdminAtual } from './state.js';
import { formatarStatus, formatarDataBR, definirValorSelect } from './utils.js';
import { init3D } from './twin3d.js';

let modalTabela, tbodyBanco, fBatTab, fStatTab;

export function obterRegistrosFiltradosTabela() {
    let filtrados = state.dbReparos.slice().reverse();
    if (fBatTab.value !== 'Todas') filtrados = filtrados.filter(r => r.bateria === fBatTab.value);
    if (fStatTab.value !== 'Todos') filtrados = filtrados.filter(r => r.andamento === fStatTab.value);
    return filtrados;
}

export function renderizarTabela() {
    tbodyBanco.innerHTML = '';
    const filtrados = obterRegistrosFiltradosTabela();

    filtrados.forEach(reg => {
        const tr = document.createElement('tr');

        let situacaoPrazo = "Sem Prazo";
        if (reg.prazo) {
            const dataHoje = new Date().toISOString().split('T')[0];
            if (reg.andamento === 'concluido') {
                situacaoPrazo = (reg.data_fim && reg.data_fim > reg.prazo) ? "Concluído Atrasado" : "Concluído no Prazo";
            } else {
                situacaoPrazo = (dataHoje > reg.prazo) ? "Atrasado" : "No Prazo";
            }
        }

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
            <td>${situacaoPrazo}</td>
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

export function initTabela() {
    modalTabela = document.getElementById('modal_tabela');
    tbodyBanco = document.getElementById('tbody_banco');
    fBatTab = document.getElementById('filtro_tab_bat');
    fStatTab = document.getElementById('filtro_tab_status');

    document.getElementById('btn_abrir_tabela').addEventListener('click', () => { renderizarTabela(); modalTabela.classList.add('active'); });
    document.getElementById('fechar_modal_tabela').addEventListener('click', () => modalTabela.classList.remove('active'));

    document.getElementById('btn_novo_tabela').addEventListener('click', () => {
        modalTabela.classList.remove('active');
        document.getElementById('btn_abrir_manual').click();
    });

    fBatTab.addEventListener('change', renderizarTabela);
    fStatTab.addEventListener('change', renderizarTabela);

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
