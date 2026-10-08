// =========================================================
// --- AVISOS NÃO BLOQUEANTES (usados no lugar de alert()) ---
// Tipos: 'info' (padrão, laranja), 'sucesso' (verde) e 'erro' (vermelho).
// Aceita várias linhas (\n). Clique no aviso para fechar.
// =========================================================
export function mostrarToast(texto, tipo = 'info', duracao = 5000) {
    let container = document.getElementById('toast_container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast_container';
        document.body.appendChild(container);
    }

    // Mensagem idêntica já na tela (ex.: clicar em "Salvar" várias vezes): não empilha de novo
    const repetido = Array.from(container.children).find(t => t.textContent === texto && !t.dataset.saindo);
    if (repetido) return;

    const toast = document.createElement('div');
    toast.className = `toast toast_${tipo}`;
    toast.setAttribute('role', tipo === 'erro' ? 'alert' : 'status');
    toast.textContent = texto;
    container.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('visivel'));

    const remover = () => {
        toast.dataset.saindo = '1';
        toast.classList.remove('visivel');
        setTimeout(() => toast.remove(), 250);
    };
    toast.addEventListener('click', remover);
    if (duracao) setTimeout(remover, duracao);
}
