// =========================================================
// --- FOTOS DOS REPAROS (Supabase Storage, bucket "fotos_reparos") ---
// =========================================================
// - Compressão antes do upload (lado maior 1600 px, JPEG ~82%): uma foto de
//   celular de 4–8 MB vira ~300–600 KB.
// - Exibição por URL ASSINADA (link temporário): funciona com o bucket
//   privado. Os registros continuam guardando a URL "pública" original; aqui
//   ela é só convertida na hora de mostrar. Se a assinatura falhar (bucket
//   ainda público sem política de leitura), usa a URL original.
// - Exclusão do arquivo quando o reparo é apagado ou a foto é trocada.
import { config } from './state.js';
import { fetchAutenticado } from './sessao.js';

export const BUCKET_FOTOS = 'fotos_reparos';
export const TAMANHO_MAXIMO_MB = 25;
const LADO_MAXIMO = 1600;
const QUALIDADE_JPEG = 0.82;
const VALIDADE_PADRAO_S = 3600;

const base = () => `${config.SUPABASE_STORAGE_BASE}/storage/v1`;

// Caminho dentro do bucket a partir da URL guardada no registro
export function caminhoDaFoto(url) {
    if (!url) return null;
    const m = String(url).match(new RegExp(`/storage/v1/object/(?:public/|sign/|authenticated/)?${BUCKET_FOTOS}/([^?#]+)`));
    return m ? decodeURIComponent(m[1]) : null;
}

const cacheAssinadas = new Map();   // caminho -> { url, expiraEm }

function guardar(caminho, relativo, segundos) {
    const url = `${base()}${relativo.startsWith('/') ? '' : '/'}${relativo}`;
    cacheAssinadas.set(caminho, { url, expiraEm: Date.now() + (segundos - 60) * 1000 });
    return url;
}

export async function urlAssinada(urlGuardada, segundos = VALIDADE_PADRAO_S) {
    const caminho = caminhoDaFoto(urlGuardada);
    if (!caminho) return urlGuardada;
    const emCache = cacheAssinadas.get(caminho);
    if (emCache && emCache.expiraEm > Date.now()) return emCache.url;
    try {
        const resposta = await fetchAutenticado(`${base()}/object/sign/${BUCKET_FOTOS}/${encodeURI(caminho)}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ expiresIn: segundos })
        });
        if (!resposta.ok) return urlGuardada;
        const dados = await resposta.json();
        return dados?.signedURL ? guardar(caminho, dados.signedURL, segundos) : urlGuardada;
    } catch (erro) {
        return urlGuardada;
    }
}

// Várias de uma vez (exportação/impressão). Devolve Map(urlGuardada -> urlParaAbrir)
export async function urlsAssinadas(urls, segundos = VALIDADE_PADRAO_S) {
    const unicas = [...new Set(urls.filter(Boolean))];
    const mapa = new Map(unicas.map(u => [u, u]));
    const porCaminho = new Map(unicas.map(u => [caminhoDaFoto(u), u]).filter(([c]) => c));
    if (porCaminho.size === 0) return mapa;
    try {
        const resposta = await fetchAutenticado(`${base()}/object/sign/${BUCKET_FOTOS}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ expiresIn: segundos, paths: [...porCaminho.keys()] })
        });
        if (!resposta.ok) return mapa;
        const lista = await resposta.json();
        (Array.isArray(lista) ? lista : []).forEach(item => {
            const original = porCaminho.get(item.path);
            if (original && item.signedURL && !item.error) mapa.set(original, guardar(item.path, item.signedURL, segundos));
        });
    } catch (erro) { /* mantém as URLs originais */ }
    return mapa;
}

// Preenche src (e data-full do lightbox) dos <img data-foto="urlGuardada"> de um container
export async function resolverFotos(container) {
    const imgs = [...container.querySelectorAll('img[data-foto]')];
    await Promise.all(imgs.map(async (img) => {
        const url = await urlAssinada(img.dataset.foto);
        img.src = url;
        if ('full' in img.dataset) img.dataset.full = url;
    }));
}

// Reduz e converte para JPEG; se não der (formato não suportado), manda o original
export async function comprimirImagem(arquivo) {
    if (!arquivo || !arquivo.type?.startsWith('image/') || typeof createImageBitmap !== 'function') return arquivo;
    try {
        const bitmap = await createImageBitmap(arquivo);
        const escala = Math.min(1, LADO_MAXIMO / Math.max(bitmap.width, bitmap.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(bitmap.width * escala);
        canvas.height = Math.round(bitmap.height * escala);
        canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        bitmap.close?.();
        const blob = await new Promise(ok => canvas.toBlob(ok, 'image/jpeg', QUALIDADE_JPEG));
        if (!blob || blob.size >= arquivo.size) return arquivo;
        const nome = arquivo.name.replace(/\.[^.]+$/, '') + '.jpg';
        return new File([blob], nome, { type: 'image/jpeg' });
    } catch (erro) {
        console.warn('Não foi possível comprimir a foto; enviando a original.', erro);
        return arquivo;
    }
}

// Apaga arquivos do bucket (reparo excluído ou foto trocada). Falha aqui não
// impede a operação principal — no máximo sobra um arquivo órfão.
export async function excluirFotos(urls) {
    const caminhos = [...new Set((urls || []).map(caminhoDaFoto).filter(Boolean))];
    if (caminhos.length === 0) return;
    try {
        const resposta = await fetchAutenticado(`${base()}/object/${BUCKET_FOTOS}`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prefixes: caminhos })
        });
        if (!resposta.ok) console.warn('Fotos não foram apagadas do Storage:', await resposta.text());
        caminhos.forEach(c => cacheAssinadas.delete(c));
    } catch (erro) {
        console.warn('Fotos não foram apagadas do Storage:', erro);
    }
}
