// Ambiente mínimo de navegador para importar os módulos do app no Node (testes de unidade).
// Precisa ser importado ANTES dos módulos do app (state.js lê window.SUPABASE_CONFIG ao carregar).
globalThis.window = globalThis;
window.SUPABASE_CONFIG = { url: 'https://teste.supabase.co/rest/v1', key: 'sb_publishable_teste' };

const memoria = new Map();
globalThis.localStorage = {
    getItem: (k) => (memoria.has(k) ? memoria.get(k) : null),
    setItem: (k, v) => memoria.set(k, String(v)),
    removeItem: (k) => memoria.delete(k),
    clear: () => memoria.clear(),
};
globalThis.document ??= { visibilityState: 'visible', getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], addEventListener() {} };

// fetch falso: cada teste define `respostas` (função que recebe url/opções e devolve {status, corpo})
export const chamadas = [];
export function simularFetch(responder) {
    chamadas.length = 0;
    globalThis.fetch = async (url, opcoes = {}) => {
        chamadas.push({ url: String(url), opcoes });
        const { status = 200, corpo = [] } = await responder(String(url), opcoes);
        return new Response(status === 204 ? null : JSON.stringify(corpo), { status, headers: { 'Content-Type': 'application/json' } });
    };
}
