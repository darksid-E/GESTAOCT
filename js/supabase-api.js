// =========================================================
// --- INTEGRAÇÃO COM SUPABASE (tabela "reparos" + Storage de fotos) ---
// =========================================================
import { state, config, tokenAtual } from './state.js';

function headersSupabase(extra = {}) {
    return {
        apikey: config.SUPABASE_KEY,
        Authorization: `Bearer ${tokenAtual()}`,
        'Content-Type': 'application/json',
        ...extra
    };
}

async function requisicaoSupabase(tabela, caminho, options = {}) {
    if (!state.supabaseAtivo) throw new Error('Supabase não configurado.');
    const resposta = await fetch(`${config.SUPABASE_URL}/${tabela}${caminho}`, {
        ...options,
        headers: headersSupabase(options.headers || {})
    });
    if (!resposta.ok) {
        const detalhe = await resposta.text();
        throw new Error(`Supabase ${resposta.status}: ${detalhe}`);
    }
    if (resposta.status === 204) return null;
    return resposta.json();
}

export async function listarReparosSupabase() {
    return requisicaoSupabase(config.SUPABASE_TABLE, '?select=*&order=id_reparo.asc');
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
    return requisicaoSupabase(config.SUPABASE_TABLE_MAQUINAS, '?select=*&order=id.desc');
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

// NOVO: Função de Upload para o Supabase
export async function uploadFotoSupabase(file, tipoDaFoto) {
    if (!state.supabaseAtivo) return null;
    const path = `reparos/${Date.now()}_${tipoDaFoto}_${file.name.replace(/\s+/g, '_')}`;

    const resposta = await fetch(`${config.SUPABASE_STORAGE_BASE}/storage/v1/object/fotos_reparos/${path}`, {
        method: 'POST',
        headers: {
            apikey: config.SUPABASE_KEY,
            Authorization: `Bearer ${tokenAtual()}`,
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
