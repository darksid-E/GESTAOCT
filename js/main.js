// =========================================================
// --- PONTO DE ENTRADA DA APLICAÇÃO ---
// =========================================================
// Este arquivo substitui o antigo `script.js` monolítico. Cada bloco de
// funcionalidade agora é um módulo ES separado (pasta js/); aqui a gente
// só liga tudo, na mesma ordem em que o script original rodava.
import { initNavigation } from './navigation.js';
import { initAuth, inicializarApp } from './auth.js';
import { initMapa2D } from './mapa2d.js';
import { initModalReparo } from './modal-reparo.js';
import { initImpressao } from './impressao.js';
import { initTabela } from './tabela.js';
import { initTemperaturas } from './temperaturas.js';
import { initDashboard } from './dashboard.js';

document.addEventListener('DOMContentLoaded', () => {
    // --- 1. Menu, abas e cadastro/login ---
    initNavigation();
    initAuth();

    // Dispara o carregamento assíncrono dos dados (Supabase Auth + tabela
    // "reparos") e, quando terminar, gera o mapa 2D e aplica permissões.
    // Não usamos "await" aqui de propósito: o restante da inicialização
    // síncrona abaixo roda antes dessa Promise resolver, exatamente como
    // no script.js original.
    inicializarApp();

    // --- 2..6. Mapa 2D/3D, modal de reparo, impressão, tabela, gráficos ---
    initMapa2D();
    initModalReparo();
    initImpressao();
    initTabela();
    initTemperaturas();
    initDashboard();
});
