// =========================================================
// --- 1. LÓGICA DO MENU E ABAS ---
// =========================================================
import { state, config } from './state.js';
import { renderizarDashboard } from './dashboard.js';
import { renderizarPaginaMaquinas, aplicarFiltroBateriaMaquinas } from './maquinas.js';
import { aplicarFiltroBateriaMapa, processarDadosGlobais } from './mapa2d.js';

let menuButton, sideBar, navButtons, subBotoesBateria, pageSections, sidebarBackdrop;

function abrirSidebar() {
    sideBar.classList.add("active");
    sidebarBackdrop.classList.add("active");
}
function fecharSidebar() {
    sideBar.classList.remove("active");
    sidebarBackdrop.classList.remove("active");
}

export function irParaAba(targetId) {
    const button = Array.from(navButtons).find(btn => btn.getAttribute('data-target') === targetId);
    navButtons.forEach(btn => btn.classList.remove("active_link"));
    if (button) button.classList.add("active_link");
    pageSections.forEach(section => section.classList.remove("active_section"));
    const targetSection = document.getElementById(targetId);
    if (targetSection) targetSection.classList.add("active_section");

    if (targetId === 'dashboard') { renderizarDashboard(); }
    if (targetId === 'maquinas') { renderizarPaginaMaquinas(); }
}

// Confere login antes de navegar; usado tanto pelos botões principais
// quanto pelos sub-botões de bateria no aside. Retorna true se pode
// seguir com a navegação, false se foi redirecionado pro login.
function podeNavegarPara(targetId) {
    const logado = !!state.sessaoAtual;
    if (!logado && !config.ABAS_LIVRES_SEM_LOGIN.includes(targetId)) {
        alert('Faça login para acessar esta área.');
        irParaAba('cadastro');
        if (window.innerWidth <= 768) fecharSidebar();
        return false;
    }
    return true;
}

export function initNavigation() {
    menuButton = document.getElementById("menu");
    sideBar = document.getElementById("side_bar");
    sidebarBackdrop = document.getElementById("sidebar_backdrop");
    navButtons = document.querySelectorAll(".nav_btn");
    subBotoesBateria = document.querySelectorAll(".nav_sub_btn");
    pageSections = document.querySelectorAll(".page_section");

    if (window.innerWidth > 768) sideBar.classList.add("active");
    menuButton.addEventListener("click", () => {
        if (sideBar.classList.contains("active")) fecharSidebar();
        else abrirSidebar();
    });
    sidebarBackdrop.addEventListener("click", fecharSidebar);

    window.irParaAba = irParaAba;

    navButtons.forEach(button => {
        button.addEventListener("click", () => {
            const targetId = button.getAttribute("data-target");
            if (!podeNavegarPara(targetId)) return;
            irParaAba(targetId);
            if (window.innerWidth <= 768) fecharSidebar();
        });
    });

    // Sub-botões de bateria (aparecem embaixo de "Gestão de Reparos" e
    // "Máquinas" quando essa página está ativa — ver CSS
    // ".nav_btn.active_link + .nav_submenu"). Selecionar um deles troca
    // o filtro de bateria daquela página, no lugar dos antigos <select>.
    subBotoesBateria.forEach(botao => {
        botao.addEventListener("click", () => {
            const pagina = botao.dataset.pagina;
            if (!podeNavegarPara(pagina)) return;

            botao.parentElement.querySelectorAll('.nav_sub_btn').forEach(b => b.classList.remove('active_link'));
            botao.classList.add('active_link');

            if (pagina === 'reparos') {
                state.filtroBateriaReparos = botao.dataset.bateria;
                aplicarFiltroBateriaMapa();
                processarDadosGlobais();
            } else if (pagina === 'maquinas') {
                state.filtroBateriaMaquinas = botao.dataset.bateria;
                aplicarFiltroBateriaMaquinas();
            }

            irParaAba(pagina);
            if (window.innerWidth <= 768) fecharSidebar();
        });
    });

    const selForno = document.getElementById('sel_forno');
    for (let i = 1; i <= 18; i++) {
        let f = i.toString().padStart(2, '0');
        selForno.innerHTML += `<option value="${f}">${f}</option>`;
    }
}

// Usados por outros módulos para checar visibilidade de abas (auth.js)
export function getNavElements() {
    return { navButtons, pageSections };
}