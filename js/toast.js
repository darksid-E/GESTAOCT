// =========================================================
// --- AVISOS NÃO BLOQUEANTES (substitui alert()) ---
// =========================================================
export function mostrarToast(texto, tipo = 'info', duracao = 5000) {
    let container = document.getElementById('toast_container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast_container';
        document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = `toast toast_${tipo}`;
    toast.setAttribute('role', tipo === 'erro' ? 'alert' : 'status');
    toast.textContent = texto;
    container.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('visivel'));

    const remover = () => {
        toast.classList.remove('visivel');
        setTimeout(() => toast.remove(), 250);
    };
    toast.addEventListener('click', remover);
    if (duracao) setTimeout(remover, duracao);
}
