// =========================================================
// --- 1. LÓGICA DO MENU E ABAS ---
// =========================================================
import { state, config } from './state.js';
import { renderizarDashboard } from './dashboard.js';
import { renderizarGraficoTemperaturaTab } from './temperaturas.js';

let menuButton, sideBar, navButtons, pageSections;

export function irParaAba(targetId) {
    const button = Array.from(navButtons).find(btn => btn.getAttribute('data-target') === targetId);
    navButtons.forEach(btn => btn.classList.remove("active_link"));
    if (button) button.classList.add("active_link");
    pageSections.forEach(section => section.classList.remove("active_section"));
    const targetSection = document.getElementById(targetId);
    if (targetSection) targetSection.classList.add("active_section");

    if (targetId === 'dashboard') { renderizarDashboard(); }
    if (targetId === 'temperaturas') { renderizarGraficoTemperaturaTab(); }
}

export function initNavigation() {
    menuButton = document.getElementById("menu");
    sideBar = document.getElementById("side_bar");
    navButtons = document.querySelectorAll(".nav_btn");
    pageSections = document.querySelectorAll(".page_section");

    if (window.innerWidth > 768) sideBar.classList.add("active");
    menuButton.addEventListener("click", () => sideBar.classList.toggle("active"));

    window.irParaAba = irParaAba;

    navButtons.forEach(button => {
        button.addEventListener("click", (e) => {
            const targetId = button.getAttribute("data-target");
            const logado = !!state.sessaoAtual;
            if (!logado && !config.ABAS_LIVRES_SEM_LOGIN.includes(targetId)) {
                alert('Faça login para acessar esta área.');
                irParaAba('cadastro');
                if (window.innerWidth <= 768) sideBar.classList.remove("active");
                return;
            }
            irParaAba(targetId);
            if (window.innerWidth <= 768) sideBar.classList.remove("active");
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
