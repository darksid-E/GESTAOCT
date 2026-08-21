// =========================================================
// --- 1b. MAPA 2D (geração do grid de fornos) ---
// --- 2. TOOLTIP E CARDS DE RESUMO ---
// =========================================================
import { state } from './state.js';
import { formatarStatus } from './utils.js';
import { abrirModalMapClick } from './modal-reparo.js';

export function gerarMapaBaterias() {
    const container = document.getElementById("baterias_conteudo");
    if (!container) return;
    const baterias = ['A', 'B', 'C'];
    const blocosTop = [1, 2, 3, 4];
    const blocosBottom = [5, 6, 7, 8];

    baterias.forEach(bat => {
        const batDiv = document.createElement('div');
        batDiv.className = 'bateria_wrapper';
        batDiv.innerHTML = `<h3 class="bateria_titulo">Bateria ${bat}</h3>`;
        batDiv.appendChild(criarLinhaBlocos(bat, blocosTop, 'top'));

        const quenchLine = document.createElement('div');
        quenchLine.className = 'quenching_car';
        quenchLine.innerText = 'LINHA DO QUENCHING ◄ ►';

        batDiv.appendChild(quenchLine);
        batDiv.appendChild(criarLinhaBlocos(bat, blocosBottom, 'bottom'));
        container.appendChild(batDiv);
    });
}

function criarLinhaBlocos(bateria, blocos, posicao) {
    const row = document.createElement('div');
    row.className = 'linha_blocos';

    blocos.forEach(numBloco => {
        const blocoDiv = document.createElement('div');
        blocoDiv.className = 'bloco';
        blocoDiv.innerHTML = `<div class="bloco_titulo">Bloco ${numBloco}</div>`;

        let ladoTop = posicao === 'top' ? 'LM' : 'LC';
        let ladoBot = posicao === 'top' ? 'LC' : 'LM';

        const colTop = criarLinhaColetor(bateria, numBloco, ladoTop);
        const colBot = criarLinhaColetor(bateria, numBloco, ladoBot);

        const gridFornos = document.createElement('div');
        gridFornos.className = 'fornos_grid';

        for (let i = 1; i <= 18; i++) {
            const numForno = i.toString().padStart(2, '0');
            const fornoColuna = document.createElement('div');
            fornoColuna.className = 'forno_coluna';

            let strLM = `${numForno} - ${bateria}${numBloco} - LM`;
            let strLC = `${numForno} - ${bateria}${numBloco} - LC`;

            const numeroDiv = document.createElement('div');
            numeroDiv.className = 'forno_numero';
            numeroDiv.innerText = i;

            let domLM = criarLadoForno(strLM, bateria, numBloco, numForno, 'LM', posicao === 'top');
            let domLC = criarLadoForno(strLC, bateria, numBloco, numForno, 'LC', posicao !== 'top');

            if (posicao === 'top') {
                fornoColuna.appendChild(domLM);
                fornoColuna.appendChild(numeroDiv);
                fornoColuna.appendChild(domLC);
            } else {
                fornoColuna.appendChild(domLC);
                fornoColuna.appendChild(numeroDiv);
                fornoColuna.appendChild(domLM);
            }
            gridFornos.appendChild(fornoColuna);
        }

        blocoDiv.appendChild(colTop);
        blocoDiv.appendChild(gridFornos);
        blocoDiv.appendChild(colBot);
        row.appendChild(blocoDiv);
    });
    return row;
}

// Antes o coletor era uma única barra por bloco/lado (sem distinguir o
// forno). Agora vira uma linha com 18 segmentos — um por forno — alinhados
// com as colunas de "fornos_grid" logo abaixo/acima.
function criarLinhaColetor(bateria, numBloco, lado) {
    const linha = document.createElement('div');
    linha.className = 'coletor_row';

    for (let i = 1; i <= 18; i++) {
        const numForno = i.toString().padStart(2, '0');
        const idColetor = `${numForno} - ${bateria}${numBloco} - Coletor ${lado}`;

        const seg = document.createElement('div');
        seg.className = 'coletor_seg';
        seg.dataset.id = idColetor;
        seg.title = idColetor;
        seg.onclick = () => abrirModalMapClick('Coletor', bateria, numBloco, numForno, lado);

        linha.appendChild(seg);
    }
    return linha;
}

function criarLadoForno(idString, bat, bloco, forno, lado, isTopSide) {
    const ladoContainer = document.createElement('div');
    ladoContainer.className = 'lado_container';

    const fornoMain = document.createElement('div');
    fornoMain.className = 'forno_main';
    fornoMain.dataset.id = idString;
    fornoMain.onclick = () => abrirModalMapClick('Forno', bat, bloco, forno, lado);

    const rowSF = document.createElement('div');
    rowSF.className = 'sole_flues_row';
    for (let s = 1; s <= 4; s++) {
        const sfDiv = document.createElement('div');
        sfDiv.className = 'sole_flue'; sfDiv.innerText = s;
        sfDiv.dataset.id = `${idString} - SF${s}`;
        sfDiv.onclick = () => abrirModalMapClick(`Sole Flue ${s}`, bat, bloco, forno, lado);
        rowSF.appendChild(sfDiv);
    }

    if (isTopSide) { ladoContainer.appendChild(rowSF); ladoContainer.appendChild(fornoMain); }
    else { ladoContainer.appendChild(fornoMain); ladoContainer.appendChild(rowSF); }
    return ladoContainer;
}

export function processarDadosGlobais() {
    window.mapaStatusAtual = {};
    let counts = { inspecao: 0, nao_reparado: 0, em_andamento: 0, concluido: 0 };

    document.querySelectorAll('.forno_main, .sole_flue, .coletor_seg').forEach(el => {
        el.classList.remove('status_inspecao', 'status_nao_reparado', 'status_em_andamento', 'status_concluido');
    });

    state.dbReparos.forEach(reg => {
        if (reg.id_referencia.includes('Ambos')) {
            let idLC = reg.id_referencia.replace('Ambos', 'LC');
            let idLM = reg.id_referencia.replace('Ambos', 'LM');
            window.mapaStatusAtual[idLC] = reg;
            window.mapaStatusAtual[idLM] = reg;
        } else {
            window.mapaStatusAtual[reg.id_referencia] = reg;
        }
    });

    for (let id in window.mapaStatusAtual) {
        const reg = window.mapaStatusAtual[id];
        const elDOM = document.querySelector(`[data-id="${id}"]`);
        if (elDOM) {
            elDOM.classList.add(`status_${reg.andamento}`);
        }
        if (counts[reg.andamento] !== undefined) counts[reg.andamento]++;
    }

    document.getElementById('count_inspecao').innerText = counts.inspecao;
    document.getElementById('count_nao_reparado').innerText = counts.nao_reparado;
    document.getElementById('count_em_andamento').innerText = counts.em_andamento;
    document.getElementById('count_concluido').innerText = counts.concluido;
}

export function initMapa2D() {
    const tooltip = document.getElementById('tooltip_mapa');
    const mapaContainer = document.getElementById('baterias_container');
    let elementoComTooltip = null;

    function posicionarTooltipSobre(el) {
        const rect = el.getBoundingClientRect();
        tooltip.style.left = (rect.left + rect.width / 2) + 'px';
        tooltip.style.top = rect.top + 'px';
    }

    function mostrarTooltip(el) {
        elementoComTooltip = el;
        const id = el.dataset.id;
        const reg = window.mapaStatusAtual[id];
        tooltip.innerHTML = reg
            ? `<strong>${id}</strong><div class="tooltip_status">${formatarStatus(reg.andamento)}${reg.desc_problema ? ' • ' + reg.desc_problema : ''}</div>`
            : `<strong>${id}</strong><div class="tooltip_status">Nenhum registro</div>`;
        posicionarTooltipSobre(el);
        tooltip.style.opacity = 1;
    }

    function esconderTooltip() {
        tooltip.style.opacity = 0;
        elementoComTooltip = null;
    }

    // Delegação de eventos: um único listener no container, em vez de um
    // listener por ponto do mapa. Isso resolve dois problemas de uma vez:
    // 1) os pontos do mapa (.forno_main/.sole_flue/.coletor_seg) só existem
    //    depois que gerarMapaBaterias() roda, que é assíncrono — um
    //    listener preso em cada ponto no momento do initMapa2D() nunca
    //    chegava a ser anexado a eles.
    // 2) funciona mesmo se o mapa for redesenhado no futuro, sem precisar
    //    re-anexar nada.
    mapaContainer.addEventListener('mouseover', (e) => {
        const el = e.target.closest('.forno_main, .sole_flue, .coletor_seg');
        if (!el || el === elementoComTooltip) return;
        mostrarTooltip(el);
    });
    mapaContainer.addEventListener('mouseout', (e) => {
        const el = e.target.closest('.forno_main, .sole_flue, .coletor_seg');
        if (!el) return;
        if (el.contains(e.relatedTarget)) return; // ainda dentro do mesmo ponto
        esconderTooltip();
    });

    // Se a pessoa rolar o mapa (scroll horizontal/vertical) com o mouse
    // parado em cima de um ponto, o card acompanha em vez de ficar
    // "flutuando" desalinhado do elemento.
    mapaContainer.addEventListener('scroll', () => {
        if (elementoComTooltip) posicionarTooltipSobre(elementoComTooltip);
    });
    window.addEventListener('scroll', () => {
        if (elementoComTooltip) posicionarTooltipSobre(elementoComTooltip);
    });

    const legendItems = document.querySelectorAll('.leg_item[data-filter]');
    legendItems.forEach(item => {
        item.addEventListener('click', () => {
            const statusFiltro = item.getAttribute('data-filter');
            const todasPecas = document.querySelectorAll('.forno_main, .sole_flue, .coletor_seg');
            if (state.filtroAtivoLegenda === statusFiltro) {
                state.filtroAtivoLegenda = null;
                todasPecas.forEach(el => { el.style.opacity = '1'; el.style.boxShadow = 'none'; });
                legendItems.forEach(leg => leg.style.opacity = '1');
            } else {
                state.filtroAtivoLegenda = statusFiltro;
                legendItems.forEach(leg => leg.style.opacity = leg.getAttribute('data-filter') === statusFiltro ? '1' : '0.4');
                todasPecas.forEach(el => {
                    if (el.classList.contains(`status_${statusFiltro}`)) {
                        el.style.opacity = '1'; el.style.boxShadow = 'inset 0 0 5px rgba(0,0,0,0.8)';
                    } else {
                        el.style.opacity = '0.1'; el.style.boxShadow = 'none';
                    }
                });
            }
        });
    });

    // --- Botão "Enquadrar as 3 Baterias" ---
    // O mapa é bem largo (18 fornos x 8 blocos x 3 baterias) e normalmente
    // só dá pra ver rolando pros lados. Esse botão encolhe visualmente o
    // conteúdo (via CSS transform: scale) até caber inteiro na largura
    // disponível, sem precisar rolar. Clicar de novo volta ao tamanho normal.
    const conteudo = document.getElementById('baterias_conteudo');
    const btnEnquadrar = document.getElementById('btn_enquadrar_mapa');
    let enquadrado = false;

    function aplicarEnquadramento() {
        conteudo.style.transform = 'none';
        mapaContainer.style.height = '';
        const larguraNatural = conteudo.scrollWidth;
        const alturaNatural = conteudo.scrollHeight;
        const larguraDisponivel = mapaContainer.clientWidth;
        const escala = Math.min(larguraDisponivel / larguraNatural, 1);

        conteudo.style.transformOrigin = 'top left';
        conteudo.style.transform = `scale(${escala})`;
        mapaContainer.style.height = (alturaNatural * escala) + 'px';
    }

    function removerEnquadramento() {
        conteudo.style.transform = '';
        mapaContainer.style.height = '';
    }

    btnEnquadrar?.addEventListener('click', () => {
        enquadrado = !enquadrado;
        if (enquadrado) {
            aplicarEnquadramento();
            mapaContainer.classList.add('mapa_enquadrado');
            btnEnquadrar.innerText = '↔️ Ver Tamanho Normal';
            btnEnquadrar.classList.add('ativo');
        } else {
            removerEnquadramento();
            mapaContainer.classList.remove('mapa_enquadrado');
            btnEnquadrar.innerText = '⛶ Enquadrar as 3 Baterias';
            btnEnquadrar.classList.remove('ativo');
        }
    });

    // Se a pessoa redimensionar a janela com o mapa enquadrado, recalcula
    // a escala pra continuar cabendo certinho.
    window.addEventListener('resize', () => {
        if (enquadrado) aplicarEnquadramento();
    });
}