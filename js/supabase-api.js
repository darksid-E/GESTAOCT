// =========================================================
// --- INTEGRAÇÃO COM SUPABASE (tabela "reparos" + Storage de fotos) ---
// =========================================================
import { state, config } from './state.js';
import { fetchAutenticado } from './sessao.js';
import { comprimirImagem } from './fotos.js';

// Toda requisição passa por fetchAutenticado: o token é renovado antes de
// vencer e, se o servidor responder 401 (JWT expired), renova e repete.
async function requisicaoSupabase(tabela, caminho, options = {}) {
    if (!state.supabaseAtivo) throw new Error('Supabase não configurado.');
    const resposta = await fetchAutenticado(`${config.SUPABASE_URL}/${tabela}${caminho}`, {
        ...options,
        headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }
    });
    if (!resposta.ok) {
        const detalhe = await resposta.text();
        throw new Error(`Supabase ${resposta.status}: ${detalhe}`);
    }
    if (resposta.status === 204) return null;
    return resposta.json();
}

// O PostgREST do Supabase devolve no máximo 1000 linhas por resposta (max-rows).
// Sem paginar, tabelas maiores que isso eram cortadas em silêncio. Busca em
// páginas até a última vir incompleta. `consulta` já traz select/order/filtros;
// a ordenação precisa ser estável (terminar em uma coluna única, como id).
export const TAMANHO_PAGINA = 1000;
const LIMITE_PAGINAS = 500;   // trava de segurança: 500 mil linhas

export async function listarTodos(tabela, consulta) {
    let todos = [];
    for (let pagina = 0; pagina < LIMITE_PAGINAS; pagina++) {
        const lote = await requisicaoSupabase(tabela, `?${consulta}&limit=${TAMANHO_PAGINA}&offset=${pagina * TAMANHO_PAGINA}`) || [];
        todos = todos.concat(lote);
        if (lote.length < TAMANHO_PAGINA) break;
    }
    return todos;
}

export async function listarReparosSupabase() {
    return listarTodos(config.SUPABASE_TABLE, 'select=*&order=id_reparo.asc');
}

export async function criarReparoSupabase(dados) {
    const resposta = await requisicaoSupabase(config.SUPABASE_TABLE, '', {
        method: 'POST',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify(dados)
    });
    return resposta[0];
}

export async function atualizarReparoSupabase(idReparo, dados) {
    const resposta = await requisicaoSupabase(config.SUPABASE_TABLE, `?id_reparo=eq.${encodeURIComponent(idReparo)}`, {
        method: 'PATCH',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify(dados)
    });
    return resposta[0];
}

export async function excluirReparoSupabase(idReparo) {
    await requisicaoSupabase(config.SUPABASE_TABLE, `?id_reparo=eq.${encodeURIComponent(idReparo)}`, {
        method: 'DELETE',
        headers: { Prefer: 'return=minimal' }
    });
}

// --- "maquinas" (lançamentos de altura/perfil de carga) ---

export async function listarMaquinasSupabase() {
    return listarTodos(config.SUPABASE_TABLE_MAQUINAS, 'select=*&order=id.desc');
}

export async function criarMaquinaSupabase(dados) {
    const resposta = await requisicaoSupabase(config.SUPABASE_TABLE_MAQUINAS, '', {
        method: 'POST',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify(dados)
    });
    return resposta[0];
}

export async function atualizarMaquinaSupabase(id, dados) {
    const resposta = await requisicaoSupabase(config.SUPABASE_TABLE_MAQUINAS, `?id=eq.${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify(dados)
    });
    return resposta[0];
}

export async function excluirMaquinaSupabase(id) {
    await requisicaoSupabase(config.SUPABASE_TABLE_MAQUINAS, `?id=eq.${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: { Prefer: 'return=minimal' }
    });
}

// --- "relatorio_turno" (Relatório de passagem de turno) ---

export async function listarRelatorioItensSupabase() {
    return listarTodos(config.SUPABASE_TABLE_RELATORIO_ITENS, 'select=*&order=ordem.asc,id.asc');
}

// O PostgREST devolve no máximo 1000 linhas por resposta, então busca em
// páginas até acabar. Filtra por período (datas aaaa-mm-dd) para não
// trazer o histórico inteiro.
export async function listarRelatorioTurnoSupabase({ inicio, fim } = {}) {
    const filtros = [];
    if (inicio) filtros.push(`data=gte.${encodeURIComponent(inicio)}`);
    if (fim) filtros.push(`data=lte.${encodeURIComponent(fim)}`);
    return listarTodos(config.SUPABASE_TABLE_RELATORIO_TURNO, ['select=*', ...filtros, 'order=data.desc,id.desc'].join('&'));
}

// Último registro de cada item (por bateria e tipo) até a data informada — função
// relatorio_turno_ultimos no banco (sql-relatorio-turno-atualizacao-1.sql).
export async function listarUltimosRelatorioTurnoSupabase(ate) {
    return requisicaoSupabase('rpc/relatorio_turno_ultimos', '', {
        method: 'POST',
        body: JSON.stringify({ ate })
    });
}

// Upsert: um item só tem uma linha por data/bateria/tipo; relançar atualiza a existente.
export async function gravarRelatorioTurnoSupabase(linhas) {
    return requisicaoSupabase(config.SUPABASE_TABLE_RELATORIO_TURNO, '?on_conflict=data,bateria,tipo,item_id', {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
        body: JSON.stringify(linhas)
    });
}

// Editor de metas (RLS: só isDev). Devolve as linhas alteradas; vazio = sem permissão.
export async function atualizarRelatorioItensSupabase(ids, dados) {
    const lista = ids.map(Number).filter(Number.isFinite).join(',');
    const resposta = await requisicaoSupabase(config.SUPABASE_TABLE_RELATORIO_ITENS, `?id=in.(${lista})`, {
        method: 'PATCH',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify(dados)
    });
    if (!Array.isArray(resposta) || resposta.length === 0) throw new Error('Nenhum item foi alterado (apenas desenvolvedores podem editar metas).');
    return resposta;
}

// Cadastro de metas novas (RLS: só isDev). Devolve as linhas criadas.
export async function criarRelatorioItensSupabase(linhas) {
    const resposta = await requisicaoSupabase(config.SUPABASE_TABLE_RELATORIO_ITENS, '', {
        method: 'POST',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify(linhas)
    });
    if (!Array.isArray(resposta) || resposta.length === 0) throw new Error('Nenhuma meta foi cadastrada (apenas desenvolvedores podem cadastrar metas).');
    return resposta;
}

export async function atualizarRelatorioTurnoSupabase(id, dados) {
    const resposta = await requisicaoSupabase(config.SUPABASE_TABLE_RELATORIO_TURNO, `?id=eq.${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify(dados)
    });
    return resposta[0];
}

export async function excluirRelatorioTurnoSupabase(id) {
    await requisicaoSupabase(config.SUPABASE_TABLE_RELATORIO_TURNO, `?id=eq.${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: { Prefer: 'return=minimal' }
    });
}

// Upload de foto do reparo (comprimida antes). Devolve a URL a guardar no
// registro; para exibir, use urlAssinada() de fotos.js.
export async function uploadFotoSupabase(file, tipoDaFoto) {
    if (!state.supabaseAtivo) return null;
    file = await comprimirImagem(file);
    const nomeSeguro = file.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\w.-]+/g, '_');
    const path = `reparos/${Date.now()}_${tipoDaFoto}_${nomeSeguro}`;

    const resposta = await fetchAutenticado(`${config.SUPABASE_STORAGE_BASE}/storage/v1/object/fotos_reparos/${path}`, {
        method: 'POST',
        headers: {
            'Content-Type': file.type,
            'x-upsert': 'true'
        },
        body: file
    });

    if (!resposta.ok) {
        console.error('Erro ao subir foto:', await resposta.text());
        return null;
    }

    return `${config.SUPABASE_STORAGE_BASE}/storage/v1/object/public/fotos_reparos/${path}`;
}

export async function importarReparosSupabase(registros) {
    const resposta = await requisicaoSupabase(config.SUPABASE_TABLE, '?on_conflict=id_reparo', {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
        body: JSON.stringify(registros)
    });
    return resposta;
}

// --- "perfis" (usado pela página Permissões; só admins enxergam todos) ---

export async function listarPerfisSupabase() {
    return listarTodos(config.SUPABASE_TABLE_PERFIS, 'select=*&order=nome.asc,id.asc');
}

export async function atualizarPerfilSupabase(id, dados) {
    const resposta = await requisicaoSupabase(config.SUPABASE_TABLE_PERFIS, `?id=eq.${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify(dados)
    });
    // O RLS não dá erro quando filtra a linha: devolve lista vazia.
    if (!resposta || resposta.length === 0) throw new Error('Nenhum perfil foi atualizado (sem permissão ou usuário inexistente).');
    return resposta[0];
}

// --- Itens de Controle (Comporta, Sapata, Truck, Queda de Material) ---

export async function listarControleSupabase(tabela) {
    return listarTodos(tabela, 'select=*&order=data.desc,id.desc');
}

export async function criarControleSupabase(tabela, dados) {
    const resposta = await requisicaoSupabase(tabela, '', {
        method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify(dados)
    });
    return Array.isArray(resposta) ? resposta[0] : null;
}

export async function atualizarControleSupabase(tabela, id, dados) {
    const resposta = await requisicaoSupabase(tabela, `?id=eq.${encodeURIComponent(id)}`, {
        method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify(dados)
    });
    if (!Array.isArray(resposta) || resposta.length === 0) throw new Error('Nenhum registro foi atualizado (sem permissão ou registro inexistente).');
    return resposta[0];
}

export async function excluirControleSupabase(tabela, id) {
    const resposta = await requisicaoSupabase(tabela, `?id=eq.${encodeURIComponent(id)}`, {
        method: 'DELETE', headers: { Prefer: 'return=representation' }
    });
    if (!Array.isArray(resposta) || resposta.length === 0) throw new Error('Nenhum registro foi excluído (sem permissão ou registro inexistente).');
}
