// =========================================================
// --- CLIENTE DO PI WEB API (chamada direta do navegador) ---
// =========================================================
// Sem servidor no meio: o navegador chama o PI Web API direto,
// usando a sessão Windows do usuário (Kerberos/NTLM) — o mesmo jeito
// que o PI Vision já autentica hoje. Isso só funciona quando o
// dispositivo está na rede/VPN da Ternium; fora dela, a chamada falha
// e cada função abaixo devolve `{ indisponivel: true }` pra quem
// chamou poder mostrar um aviso em vez de quebrar a tela.
//
// Nada aqui é salvo no Supabase — cada chamada busca ao vivo.

const BASE_URL = window.PI_CONFIG?.baseUrl || '';
const PI_SERVER = window.PI_CONFIG?.server || '';

const TIPOS_TAG = {
    TOPO: 'TOP',
    LC: 'CS', // Lado Coqueria = Coke Side
    LM: 'MS', // Lado Máquinas = Machine Side
};

function montarTag(bateria, bloco, forno, tipoLabel) {
    const sufixo = TIPOS_TAG[tipoLabel];
    const fornoStr = String(forno).padStart(2, '0');
    return `COKE-${bateria}-OVEN-${fornoStr}${bateria}${bloco}-${sufixo}-TEMP`;
}

export function paraDataHoraPI(ms) {
    const d = new Date(ms);
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

async function chamarPi(caminho) {
    const resp = await fetch(`${BASE_URL}${caminho}`, { credentials: 'include' });
    if (!resp.ok) throw new Error(`PI Web API respondeu ${resp.status}`);
    return resp.json();
}

async function resolveWebId(tagName) {
    const path = `\\\\${PI_SERVER}\\${tagName}`;
    try {
        const data = await chamarPi(`/points?path=${encodeURIComponent(path)}`);
        return data.WebId || null;
    } catch {
        return null;
    }
}

async function buscarInterpolado(webId, startTime, endTime, interval) {
    const qs = `startTime=${encodeURIComponent(startTime)}&endTime=${encodeURIComponent(endTime)}&interval=${encodeURIComponent(interval)}`;
    return chamarPi(`/streams/${webId}/interpolated?${qs}`);
}

function calcularIndicadores(pontos) {
    const valores = pontos.map(p => p.v).filter(v => typeof v === 'number' && !Number.isNaN(v));
    if (!valores.length) return { min: null, max: null, media: null };
    const soma = valores.reduce((a, b) => a + b, 0);
    return {
        min: Math.min(...valores),
        max: Math.max(...valores),
        media: Number((soma / valores.length).toFixed(1)),
    };
}

/**
 * Busca as três séries (TOPO/LC/LM) de um forno num período, direto
 * do navegador. Retorna:
 *   - { indisponivel: true } se não conseguiu nem falar com o PI
 *     (fora da rede/VPN, CORS não liberado, etc)
 *   - { dados: { TOPO: {...}, LC: {...}, LM: {...} } } em caso de sucesso
 */
export async function buscarDadosPI(bateria, bloco, forno, startMs, endMs, interval = '5m') {
    if (!BASE_URL || !PI_SERVER) return { indisponivel: true };

    const startTime = paraDataHoraPI(startMs);
    const endTime = paraDataHoraPI(endMs);
    const resultado = {};

    try {
        for (const tipoLabel of Object.keys(TIPOS_TAG)) {
            const tag = montarTag(bateria, bloco, forno, tipoLabel);
            const webId = await resolveWebId(tag);

            if (!webId) {
                resultado[tipoLabel] = { tag, pontos: [], indicadores: { min: null, max: null, media: null }, erro: 'Tag não encontrada' };
                continue;
            }

            const dados = await buscarInterpolado(webId, startTime, endTime, interval);
            const pontos = (dados.Items || [])
                .filter(item => item.Good && typeof item.Value !== 'object')
                .map(item => ({ t: item.Timestamp, v: item.Value }));

            resultado[tipoLabel] = { tag, pontos, indicadores: calcularIndicadores(pontos) };
        }

        return { dados: resultado };
    } catch (erro) {
        // Fetch cross-origin bloqueado por CORS ou host inalcançável
        // chegam aqui como TypeError "Failed to fetch" — nesse caso,
        // o mais provável é que o dispositivo está fora da rede/VPN.
        console.warn('PI Web API indisponível:', erro);
        return { indisponivel: true };
    }
}
