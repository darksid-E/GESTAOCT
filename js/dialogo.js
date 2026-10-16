// =========================================================
// --- CONFIRMAÇÃO NO VISUAL DO APP (substitui o confirm() do navegador) ---
// =========================================================
// const ok = await confirmar('Deseja excluir este registro?');
// Enter/clique em "Confirmar" = true; Esc/clique fora/"Cancelar" = false.
let caixaCriada = null;
function obterCaixa() {
    if (caixaCriada)
        return caixaCriada;
    const caixa = document.createElement('div');
    caixa.className = 'modal_overlay dialogo_overlay';
    caixa.innerHTML = `
        <div class="modal_content dialogo_conteudo" role="alertdialog" aria-modal="true" aria-labelledby="dialogo_titulo" aria-describedby="dialogo_texto">
            <header class="modal_header"><h3 id="dialogo_titulo">Confirmar</h3></header>
            <div class="dialogo_corpo">
                <p id="dialogo_texto"></p>
                <div class="botoes_form">
                    <button type="button" class="btn_acao" data-resposta="sim">Confirmar</button>
                    <button type="button" class="btn_cancelar_edicao" data-resposta="nao">Cancelar</button>
                </div>
            </div>
        </div>`;
    document.body.appendChild(caixa);
    caixaCriada = caixa;
    return caixa;
}
export function confirmar(mensagem, { titulo = 'Confirmar', textoConfirmar = 'Confirmar', perigo = true } = {}) {
    const caixa = obterCaixa();
    caixa.querySelector('#dialogo_titulo').textContent = titulo;
    caixa.querySelector('#dialogo_texto').textContent = mensagem; // textContent: nunca vira HTML
    const botaoSim = caixa.querySelector('[data-resposta="sim"]');
    botaoSim.textContent = textoConfirmar;
    botaoSim.classList.toggle('btn_perigo', perigo);
    const focoAnterior = document.activeElement;
    caixa.classList.add('active');
    botaoSim.focus();
    return new Promise(resolve => {
        const fechar = (resposta) => {
            caixa.classList.remove('active');
            caixa.removeEventListener('click', aoClicar);
            document.removeEventListener('keydown', aoTeclar, true);
            focoAnterior?.focus?.();
            resolve(resposta);
        };
        const aoClicar = (e) => {
            if (e.target === caixa)
                return fechar(false);
            const botao = e.target.closest('[data-resposta]');
            if (botao)
                fechar(botao.dataset.resposta === 'sim');
        };
        const aoTeclar = (e) => {
            if (e.key === 'Escape') {
                e.stopPropagation();
                fechar(false);
            }
            if (e.key === 'Enter') {
                e.preventDefault();
                fechar(document.activeElement?.dataset?.resposta !== 'nao');
            }
        };
        caixa.addEventListener('click', aoClicar);
        document.addEventListener('keydown', aoTeclar, true);
    });
}
//# sourceMappingURL=dialogo.js.map