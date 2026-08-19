// =========================================================
// --- IMPRESSÃO (prontuário do forno / registro único / tabela geral) ---
// =========================================================
import { state } from './state.js';
import { formatarStatus, formatarDataBR, calcularSituacaoPrazo } from './utils.js';
import { getObterRegistrosDoAlvo, getTituloFornoModalTexto } from './modal-reparo.js';
import { obterRegistrosFiltradosTabela } from './tabela.js';

const CSS_IMPRESSAO = `
    * { box-sizing: border-box; }
    body { font-family: Arial, Helvetica, sans-serif; color: #1a1a1a; margin: 0; padding: 24px 32px; }
    .cabecalho_impresso { border-bottom: 3px solid #e13300; padding-bottom: 12px; margin-bottom: 20px; }
    .cabecalho_impresso h1 { margin: 0 0 4px; font-size: 1.3rem; color: #e13300; }
    .cabecalho_impresso h2 { margin: 0 0 4px; font-size: 1.05rem; }
    .cabecalho_impresso p { margin: 0; font-size: 0.8rem; color: #555; }
    .reg_impresso { break-inside: avoid; page-break-inside: avoid; margin-bottom: 18px; }
    .reg_impresso_cabecalho { display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; }
    .reg_impresso_cabecalho span:first-child { font-weight: bold; }
    .status_impresso { padding: 2px 10px; border-radius: 10px; font-size: 0.75rem; font-weight: bold; color: white; }
    .status_impresso.inspecao { background: #e1a100; }
    .status_impresso.nao_reparado { background: #d32f2f; }
    .status_impresso.em_andamento { background: #1565c0; }
    .status_impresso.concluido { background: #2e7d32; }
    table.tabela_impressa { width: 100%; border-collapse: collapse; font-size: 0.85rem; margin-bottom: 8px; }
    table.tabela_impressa td { padding: 4px 6px; border: 1px solid #ddd; vertical-align: top; }
    table.tabela_impressa td:first-child { width: 150px; background: #f7f7f7; }
    .fotos_impressas { display: flex; gap: 14px; margin-top: 6px; }
    .fotos_impressas div { text-align: center; }
    .fotos_impressas span { display: block; font-size: 0.72rem; font-weight: bold; text-transform: uppercase; color: #555; margin-bottom: 3px; }
    .fotos_impressas img { width: 220px; max-width: 100%; border: 1px solid #ccc; border-radius: 4px; }
    .separador_impresso { border: none; border-top: 1px dashed #ccc; margin: 16px 0; }
    table.tabela_geral_impressa { width: 100%; border-collapse: collapse; font-size: 0.72rem; }
    table.tabela_geral_impressa th, table.tabela_geral_impressa td { border: 1px solid #ccc; padding: 4px 6px; text-align: left; }
    table.tabela_geral_impressa th { background: #f0f0f0; }
    .situacao_impressa { padding: 2px 8px; border-radius: 8px; font-size: 0.68rem; font-weight: bold; color: white; white-space: nowrap; }
    .situacao_impressa.prazo_ok { background: #2e7d32; }
    .situacao_impressa.prazo_atrasado { background: #d32f2f; }
    .situacao_impressa.prazo_neutro { background: #757575; }
    @media print {
        @page { margin: 14mm; }
        .fotos_impressas img { width: 180px; }
    }
`;

function gerarHtmlProntuario(idReferencia, registros) {
    const dataGeracao = new Date().toLocaleString('pt-BR');
    const linhas = registros.map(reg => `
        <div class="reg_impresso">
            <div class="reg_impresso_cabecalho">
                <span>${reg.data_registro}</span>
                <span class="status_impresso ${reg.andamento}">${formatarStatus(reg.andamento)}</span>
            </div>
            <table class="tabela_impressa">
                <tr><td>Alvo</td><td>${reg.id_referencia}</td></tr>
                <tr><td>Problema</td><td>${reg.desc_problema || '-'}</td></tr>
                <tr><td>Solução</td><td>${reg.desc_solucao || '-'}</td></tr>
                <tr><td>Avaliação CT</td><td>${reg.avaliacao_ct || '-'}</td></tr>
                <tr><td>Observação</td><td>${reg.observacao || '-'}</td></tr>
                <tr><td>Prazo</td><td>${formatarDataBR(reg.prazo)}</td></tr>
                <tr><td>Data Fim</td><td>${formatarDataBR(reg.data_fim)}</td></tr>
                <tr><td>Registrado por</td><td>${reg.criado_por || '-'}</td></tr>
            </table>
            ${(reg.foto_antes || reg.foto_depois) ? `
            <div class="fotos_impressas">
                ${reg.foto_antes ? `<div><span>Antes</span><img src="${reg.foto_antes}"></div>` : ''}
                ${reg.foto_depois ? `<div><span>Depois</span><img src="${reg.foto_depois}"></div>` : ''}
            </div>` : ''}
        </div>
    `).join('<hr class="separador_impresso">');

    return `<!DOCTYPE html><html lang="pt-br"><head><meta charset="UTF-8">
        <title>Prontuário ${idReferencia}</title><style>${CSS_IMPRESSAO}</style></head><body>
        <header class="cabecalho_impresso">
            <h1>Central de Dados Controle Térmico</h1>
            <h2>Prontuário de Reparos — ${idReferencia}</h2>
            <p>Gerado em ${dataGeracao} • ${registros.length} registro(s)</p>
        </header>
        ${linhas || '<p>Nenhum registro encontrado para este alvo.</p>'}
    </body></html>`;
}

function gerarHtmlTabelaGeral(registros) {
    const dataGeracao = new Date().toLocaleString('pt-BR');
    const linhas = registros.map(reg => {
        const situacao = calcularSituacaoPrazo(reg);
        return `
        <tr>
            <td>${reg.data_registro}</td>
            <td>${reg.id_referencia}</td>
            <td>${formatarStatus(reg.andamento)}</td>
            <td>${reg.bateria}</td><td>${reg.bloco}</td><td>${reg.forno}</td><td>${reg.lado}</td>
            <td>${reg.desc_problema || '-'}</td>
            <td>${reg.observacao || '-'}</td>
            <td>${formatarDataBR(reg.prazo)}</td>
            <td>${formatarDataBR(reg.data_fim)}</td>
            <td><span class="situacao_impressa ${situacao.classe}">${situacao.texto}</span></td>
            <td>${reg.criado_por || '-'}</td>
        </tr>
    `;
    }).join('');

    return `<!DOCTYPE html><html lang="pt-br"><head><meta charset="UTF-8">
        <title>Histórico Geral de Reparos</title><style>${CSS_IMPRESSAO}</style></head><body>
        <header class="cabecalho_impresso">
            <h1>Central de Dados Controle Térmico</h1>
            <h2>Histórico Geral de Reparos</h2>
            <p>Gerado em ${dataGeracao} • ${registros.length} registro(s) • filtros da tabela aplicados</p>
        </header>
        <table class="tabela_geral_impressa">
            <thead><tr>
                <th>Data</th><th>ID Alvo</th><th>Status</th><th>Bat.</th><th>Bloco</th><th>Forno</th><th>Lado</th>
                <th>Problema</th><th>Observação</th><th>Prazo</th><th>Fim</th><th>Situação</th><th>Registrado por</th>
            </tr></thead>
            <tbody>${linhas || '<tr><td colspan="13">Nenhum registro encontrado com os filtros atuais.</td></tr>'}</tbody>
        </table>
    </body></html>`;
}

function imprimirHtml(html) {
    const janela = window.open('', '_blank', 'width=900,height=700');
    if (!janela) { alert('Não foi possível abrir a janela de impressão. Verifique se o navegador bloqueou o pop-up.'); return; }
    janela.document.open();
    janela.document.write(html);
    janela.document.close();
    const dispararImpressao = () => { try { janela.focus(); janela.print(); } catch (e) { /* ignora */ } };
    janela.onload = dispararImpressao;
    setTimeout(dispararImpressao, 400); // reforço para navegadores que não disparam onload aqui
}

export function initImpressao() {
    const obterRegistrosDoAlvo = getObterRegistrosDoAlvo();

    document.getElementById('btn_imprimir_prontuario')?.addEventListener('click', () => {
        const idAtual = getTituloFornoModalTexto();
        const registros = obterRegistrosDoAlvo(idAtual).slice().reverse();
        imprimirHtml(gerarHtmlProntuario(idAtual, registros));
    });

    window.imprimirRegistroUnico = function (idReparo) {
        const reg = state.dbReparos.find(r => r.id_reparo == idReparo);
        if (!reg) return;
        imprimirHtml(gerarHtmlProntuario(reg.id_referencia, [reg]));
    };

    document.getElementById('btn_imprimir_tabela')?.addEventListener('click', () => {
        imprimirHtml(gerarHtmlTabelaGeral(obterRegistrosFiltradosTabela()));
    });
}
