// =========================================================
// --- PÁGINA "PERMISSÕES" (só administradores) ---
// =========================================================
// Lista todos os perfis cadastrados, permite trocar isAdmin e a
// visibilidade de cada página (colunas ver_<pagina>) e mostra
// indicadores de lançamentos por pessoa. As travas reais (quem pode
// alterar o quê, proteção dos desenvolvedores) ficam no banco —
// ver supabase-permissoes.sql; aqui a interface só evita ações que o
// servidor recusaria.
import { state, isAdminAtual, PAGINAS_PERMISSAO } from './state.js';
import { listarPerfisSupabase, atualizarPerfilSupabase } from './supabase-api.js';
import { mostrarToast } from './toast.js';

let perfis = [];
let carregando = false;
let elTbody, elResumo, elBusca, elFiltro, elOrdem;

const DIA_MS = 86_400_000;

function esc(valor) {
    return String(valor ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function normalizar(texto) {
    return String(texto || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function nomeCompleto(p) {
    return `${p.nome || ''} ${p.sobrenome || ''}`.trim() || p.email || 'Sem nome';
}

function iniciais(p) {
    const partes = nomeCompleto(p).split(/\s+/);
    return ((partes[0]?.[0] || '?') + (partes.length > 1 ? partes[partes.length - 1][0] : '')).toUpperCase();
}

// "dd/mm/aaaa" (reparos) ou "aaaa-mm-dd" (máquinas) -> timestamp
function paraTimestamp(data) {
    if (!data) return null;
    const br = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(data);
    if (br) return new Date(Number(br[3]), Number(br[2]) - 1, Number(br[1])).getTime();
    const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(data);
    if (iso) return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3])).getTime();
    return null;
}

function formatarData(ts) {
    if (!ts) return '-';
    return new Date(ts).toLocaleDateString('pt-BR');
}

// Atribui cada lançamento a uma pessoa pelo nome gravado em criado_por /
// registrado_por (é o que os registros guardam). Nomes repetidos entre
// perfis são ambíguos e ficam de fora para não atribuir errado.
function calcularIndicadores() {
    const porNome = new Map();
    perfis.forEach(p => {
        [nomeCompleto(p), p.email].filter(Boolean).forEach(chave => {
            const k = normalizar(chave);
            porNome.set(k, porNome.has(k) && porNome.get(k) !== p.id ? null : p.id);
        });
    });

    const ind = new Map(perfis.map(p => [p.id, { reparos: 0, maquinas: 0, ultimos30: 0, ultimo: null }]));
    const limite30 = Date.now() - 30 * DIA_MS;
    let semCorrespondencia = 0;

    const computar = (autor, data, campo) => {
        const id = porNome.get(normalizar(autor));
        if (!id) { semCorrespondencia++; return; }
        const i = ind.get(id);
        i[campo]++;
        const ts = paraTimestamp(data);
        if (ts) {
            if (ts >= limite30) i.ultimos30++;
            if (!i.ultimo || ts > i.ultimo) i.ultimo = ts;
        }
    };

    state.dbReparos.forEach(r => computar(r.criado_por, r.data_registro, 'reparos'));
    state.dbMaquinas.forEach(m => computar(m.registrado_por, m.data, 'maquinas'));
    return { ind, semCorrespondencia };
}

function renderizarResumo(ind, semCorrespondencia) {
    const admins = perfis.filter(p => p.isAdmin).length;
    const devs = perfis.filter(p => p.isDev).length;
    let totalReparos = 0, totalMaquinas = 0, total30 = 0, semLancamento = 0;
    ind.forEach(i => {
        totalReparos += i.reparos; totalMaquinas += i.maquinas; total30 += i.ultimos30;
        if (i.reparos + i.maquinas === 0) semLancamento++;
    });

    const cards = [
        ['Usuários', perfis.length, ''],
        ['Administradores', admins, 'destaque'],
        ['Desenvolvedores', devs, ''],
        ['Reparos lançados', totalReparos, 'em_andamento'],
        ['Máquinas lançadas', totalMaquinas, 'concluido'],
        ['Lançamentos em 30 dias', total30, 'inspecao'],
        ['Sem nenhum lançamento', semLancamento, 'nao_reparado'],
    ];
    elResumo.innerHTML = cards.map(([titulo, valor, classe]) =>
        `<div class="card_stat ${classe}"><h3>${esc(titulo)}</h3><p>${valor}</p></div>`).join('');
    elResumo.dataset.semCorrespondencia = semCorrespondencia;
}

function linhaUsuario(p, i, maxTotal, euId) {
    const total = i.reparos + i.maquinas;
    const ehEu = p.id === euId;
    const bloqueado = p.isDev === true && !ehEu;      // dev: só ele mesmo / o Supabase
    const adminSwitchDesabilitado = bloqueado || ehEu;

    const chips = PAGINAS_PERMISSAO.map(pg => {
        const ativo = p.isAdmin === true || p[`ver_${pg.id}`] !== false;
        const travado = p.isAdmin === true || bloqueado;
        return `<button type="button" class="chip_pagina${ativo ? ' ativo' : ''}" data-acao="pagina" data-id="${esc(p.id)}" data-pagina="${esc(pg.id)}" aria-pressed="${ativo}"${travado ? ' disabled' : ''}>${esc(pg.rotulo)}</button>`;
    }).join('');

    const selos = [
        p.isDev ? '<span class="selo selo_dev">DEV</span>' : '',
        ehEu ? '<span class="selo selo_eu">Você</span>' : '',
    ].join('');

    return `<tr data-id="${esc(p.id)}">
        <td>
            <div class="perm_usuario">
                <span class="perm_avatar">${esc(iniciais(p))}</span>
                <div class="perm_usuario_texto">
                    <span class="perm_nome"><strong>${esc(nomeCompleto(p))}</strong>${selos}</span>
                    <small>${esc(p.email || '-')}</small>
                </div>
            </div>
        </td>
        <td>${esc(p.matricula || '-')}</td>
        <td>
            <label class="switch">
                <input type="checkbox" data-acao="admin" data-id="${esc(p.id)}"${p.isAdmin ? ' checked' : ''}${adminSwitchDesabilitado ? ' disabled' : ''} aria-label="Administrador">
                <span class="switch_trilho"></span>
            </label>
        </td>
        <td><div class="chips_paginas">${chips}</div></td>
        <td>${i.reparos}</td>
        <td>${i.maquinas}</td>
        <td>
            <div class="perm_total">
                <strong>${total}</strong>
                <span class="perm_barra"><i style="width:${maxTotal ? Math.round(total / maxTotal * 100) : 0}%"></i></span>
            </div>
        </td>
        <td>${i.ultimos30}</td>
        <td>${formatarData(i.ultimo)}</td>
        <td>${p.cadastrado_em ? formatarData(new Date(p.cadastrado_em).getTime()) : '-'}</td>
    </tr>`;
}

function renderizarTabela() {
    const { ind, semCorrespondencia } = calcularIndicadores();
    renderizarResumo(ind, semCorrespondencia);

    const termo = normalizar(elBusca.value);
    const filtro = elFiltro.value;
    let lista = perfis.filter(p => {
        if (filtro === 'admins' && !p.isAdmin) return false;
        if (filtro === 'usuarios' && p.isAdmin) return false;
        if (filtro === 'sem_lancamento') { const i = ind.get(p.id); if (i.reparos + i.maquinas > 0) return false; }
        if (!termo) return true;
        return normalizar(`${nomeCompleto(p)} ${p.email || ''} ${p.matricula || ''}`).includes(termo);
    });

    const total = (p) => { const i = ind.get(p.id); return i.reparos + i.maquinas; };
    const ordem = elOrdem.value;
    lista = lista.slice().sort((a, b) => {
        if (ordem === 'lancamentos') return total(b) - total(a) || nomeCompleto(a).localeCompare(nomeCompleto(b), 'pt-BR');
        if (ordem === 'recentes') return (ind.get(b.id).ultimo || 0) - (ind.get(a.id).ultimo || 0);
        return nomeCompleto(a).localeCompare(nomeCompleto(b), 'pt-BR');
    });

    if (lista.length === 0) {
        elTbody.innerHTML = '<tr><td colspan="10" class="perm_vazio">Nenhum usuário encontrado.</td></tr>';
        return;
    }
    const maxTotal = Math.max(...perfis.map(total), 0);
    const euId = state.sessaoAtual?.user?.id;
    elTbody.innerHTML = lista.map(p => linhaUsuario(p, ind.get(p.id), maxTotal, euId)).join('');
}

function mensagemDeErro(erro) {
    const bruto = String(erro?.message || erro);
    const json = bruto.slice(bruto.indexOf('{'));
    try { return JSON.parse(json).message || bruto; } catch (e) { return bruto; }
}

async function salvarAlteracao(id, dados, textoSucesso) {
    try {
        const atualizado = await atualizarPerfilSupabase(id, dados);
        perfis = perfis.map(p => p.id === id ? { ...p, ...atualizado } : p);
        mostrarToast(textoSucesso, 'sucesso');
    } catch (erro) {
        console.error('Erro ao atualizar permissão:', erro);
        mostrarToast(`Não foi possível salvar: ${mensagemDeErro(erro)}`, 'erro', 8000);
    } finally {
        renderizarTabela();   // sempre redesenha: reflete o valor real do banco (reverte em caso de erro)
    }
}

async function aoAlterarAdmin(input) {
    const perfil = perfis.find(p => p.id === input.dataset.id);
    if (!perfil) return;
    const novo = input.checked;
    const pergunta = novo
        ? `Conceder acesso de administrador (editar dados) a ${nomeCompleto(perfil)}?`
        : `Remover o acesso de administrador de ${nomeCompleto(perfil)}?`;
    if (!window.confirm(pergunta)) { input.checked = !novo; return; }

    input.disabled = true;
    await salvarAlteracao(perfil.id, { isAdmin: novo },
        novo ? `${nomeCompleto(perfil)} agora é administrador.` : `${nomeCompleto(perfil)} deixou de ser administrador.`);
}

async function aoAlterarPagina(botao) {
    const perfil = perfis.find(p => p.id === botao.dataset.id);
    const pagina = PAGINAS_PERMISSAO.find(pg => pg.id === botao.dataset.pagina);
    if (!perfil || !pagina) return;
    const coluna = `ver_${pagina.id}`;
    const novo = perfil[coluna] === false;       // estava oculta -> liberar
    botao.disabled = true;
    await salvarAlteracao(perfil.id, { [coluna]: novo },
        `${pagina.rotulo}: ${novo ? 'liberada' : 'ocultada'} para ${nomeCompleto(perfil)}.`);
}

export async function renderizarPermissoes() {
    if (!elTbody || !isAdminAtual() || carregando) return;
    carregando = true;
    elTbody.innerHTML = '<tr><td colspan="10" class="perm_vazio">Carregando...</td></tr>';
    try {
        perfis = await listarPerfisSupabase();
        renderizarTabela();
    } catch (erro) {
        console.error('Erro ao carregar perfis:', erro);
        elTbody.innerHTML = '<tr><td colspan="10" class="perm_vazio">Não foi possível carregar os usuários.</td></tr>';
        mostrarToast(`Erro ao carregar usuários: ${mensagemDeErro(erro)}`, 'erro', 8000);
    } finally {
        carregando = false;
    }
}

export function initPermissoes() {
    elTbody = document.getElementById('tbody_permissoes');
    elResumo = document.getElementById('perm_resumo');
    elBusca = document.getElementById('perm_busca');
    elFiltro = document.getElementById('perm_filtro');
    elOrdem = document.getElementById('perm_ordem');
    if (!elTbody) return;

    [elBusca].forEach(el => el.addEventListener('input', renderizarTabela));
    [elFiltro, elOrdem].forEach(el => el.addEventListener('change', renderizarTabela));
    document.getElementById('btn_atualizar_permissoes').addEventListener('click', renderizarPermissoes);

    elTbody.addEventListener('change', (e) => {
        const alvo = e.target.closest('input[data-acao="admin"]');
        if (alvo) aoAlterarAdmin(alvo);
    });
    elTbody.addEventListener('click', (e) => {
        const botao = e.target.closest('button[data-acao="pagina"]');
        if (botao) aoAlterarPagina(botao);
    });
}
