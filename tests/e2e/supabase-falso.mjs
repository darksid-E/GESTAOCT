// Supabase FALSO para os testes de navegador: Auth, PostgREST (com limit/offset
// e corte em 1000 linhas como o real), RPC e Storage — tudo em memória.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const CDN = {
    'three.min.js': 'node_modules/three/build/three.min.js',
    'OrbitControls.js': 'node_modules/three/examples/js/controls/OrbitControls.js',
    'npm/chart.js': 'node_modules/chart.js/dist/chart.umd.js',
    'xlsx.full.min.js': 'node_modules/xlsx/dist/xlsx.full.min.js',
};
const MAX_LINHAS = 1000;   // igual ao max-rows padrão do Supabase
export const hoje = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
export const diasAtras = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return d.toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' }); };

export const USUARIOS = {
    dev: { id: 'u-dev', email: 'dev@ternium.com.br', nome: 'Dev', sobrenome: 'Teste', matricula: '1', isAdmin: true, isDev: true, ver_permissoes: true },
    admin: { id: 'u-admin', email: 'admin@ternium.com.br', nome: 'Admin', sobrenome: 'Teste', matricula: '2', isAdmin: true, isDev: false },
    leitor: { id: 'u-leitor', email: 'leitor@ternium.com.br', nome: 'Leitor', sobrenome: 'Teste', matricula: '3', isAdmin: false, isDev: false },
};

export function criarBanco(extra = {}) {
    return {
        perfis: Object.values(USUARIOS).map(u => ({ ...u })),
        reparos: [], maquinas: [], relatorio_turno_itens: [], relatorio_turno: [],
        controle_comporta: [], controle_sapata: [], controle_truck: [], controle_queda_material: [],
        fotos: new Set(), chamadas: [], tokens: {},
        ...extra,
    };
}


export async function usarSupabaseFalso(page, banco) {
    await page.route('**/*', async (route) => {
        const req = route.request();
        const url = new URL(req.url());
        const metodo = req.method();
        const json = (corpo, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(corpo), headers: { 'access-control-allow-origin': '*' } });

        if (url.hostname === '127.0.0.1') return route.continue();
        const cdn = Object.keys(CDN).find(k => req.url().includes(k));
        if (cdn) return route.fulfill({ contentType: 'text/javascript', body: readFileSync(path.join(RAIZ, CDN[cdn]), 'utf8') });
        if (url.hostname !== 'fake.supabase.co') return route.abort();
        if (metodo === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });

        banco.chamadas.push({ metodo, caminho: url.pathname, busca: url.search, corpo: req.postData() });
        const caminho = url.pathname;
        const usuario = banco.tokens[(req.headers().authorization || '').replace('Bearer ', '')];
        const perfil = usuario && banco.perfis.find(p => p.id === usuario);

        // ---------- Auth
        if (caminho === '/auth/v1/token' && url.searchParams.get('grant_type') === 'password') {
            const { email, password } = JSON.parse(req.postData());
            const p = banco.perfis.find(x => x.email === email);
            if (!p || password !== 'senha123') return json({ error_code: 'invalid_credentials', msg: 'Invalid login credentials' }, 400);
            const token = `tok-${p.id}-${Object.keys(banco.tokens).length}`;
            banco.tokens[token] = p.id;
            return json({ access_token: token, refresh_token: `ref-${p.id}`, expires_in: 3600, user: { id: p.id, email: p.email, user_metadata: {} } });
        }
        if (caminho === '/auth/v1/signup') {
            const { email } = JSON.parse(req.postData());
            if (!/@ternium\.com(\.[a-z]{2,3})?$/i.test(email)) return json({ code: 500, error_code: 'unexpected_failure', msg: 'Database error saving new user' }, 500);
            return json({ id: 'novo', email, identities: [{ id: 'x' }] });
        }
        if (caminho === '/auth/v1/logout') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*' } });

        // ---------- Storage
        if (caminho.startsWith('/storage/v1/object/sign/fotos_reparos')) {
            const corpo = JSON.parse(req.postData() || '{}');
            if (corpo.paths) return json(corpo.paths.map(p => ({ path: p, signedURL: `/object/sign/fotos_reparos/${p}?token=assinado` })));
            const p = caminho.replace('/storage/v1/object/sign/fotos_reparos/', '');
            return json({ signedURL: `/object/sign/fotos_reparos/${p}?token=assinado` });
        }
        if (caminho.startsWith('/storage/v1/object/sign/')) return route.fulfill({ status: 200, contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64') });
        if (caminho === '/storage/v1/object/fotos_reparos' && metodo === 'DELETE') {
            JSON.parse(req.postData()).prefixes.forEach(p => banco.fotos.delete(p));
            return json([]);
        }
        if (caminho.startsWith('/storage/v1/object/fotos_reparos/') && metodo === 'POST') {
            banco.fotos.add(decodeURIComponent(caminho.replace('/storage/v1/object/fotos_reparos/', '')));
            return json({ Key: 'ok' });
        }

        // ---------- PostgREST
        if (caminho === '/rest/v1/rpc/relatorio_turno_ultimos') return json(banco.relatorio_turno);
        const tabela = caminho.replace('/rest/v1/', '');
        if (!(tabela in banco)) return json([]);
        let linhas = banco[tabela];
        if (tabela !== 'perfis' && !perfil) linhas = [];   // anônimo não lê dados (RLS)
        if (tabela === 'perfis') linhas = !perfil ? [] : (perfil.ver_permissoes ? linhas : linhas.filter(l => l.id === perfil.id));
        const filtro = [...url.searchParams].find(([k, v]) => /^(eq|in)\./.test(v) && !['select', 'order', 'limit', 'offset', 'on_conflict'].includes(k));
        const casa = (l) => !filtro || (filtro[1].startsWith('eq.') ? String(l[filtro[0]]) === decodeURIComponent(filtro[1].slice(3)) : filtro[1].slice(4, -1).split(',').includes(String(l[filtro[0]])));

        if (metodo === 'GET') {
            const offset = Number(url.searchParams.get('offset') || 0);
            const limite = Math.min(Number(url.searchParams.get('limit') || MAX_LINHAS), MAX_LINHAS);
            return json(linhas.filter(casa).slice(offset, offset + limite));
        }
        if (!perfil?.isAdmin && tabela !== 'perfis') return json({ code: '42501', message: 'permission denied' }, 403);
        if (metodo === 'POST') {
            const novos = [].concat(JSON.parse(req.postData())).map((l, i) => ({ id: Date.now() + i, criado_em: new Date().toISOString(), ...l }));
            banco[tabela].push(...novos);
            return json(novos, 201);
        }
        if (metodo === 'PATCH') {
            const dados = JSON.parse(req.postData());
            const alterados = banco[tabela].filter(casa);
            alterados.forEach(l => Object.assign(l, dados));
            return json(alterados);
        }
        if (metodo === 'DELETE') {
            const removidos = banco[tabela].filter(casa);
            banco[tabela] = banco[tabela].filter(l => !casa(l));
            return json(removidos);
        }
        return json([]);
    });
}

export async function entrar(page, quem = 'dev') {
    await page.goto('/index.html');
    await page.fill('#login_email', USUARIOS[quem].email);
    await page.fill('#login_senha', 'senha123');
    await page.press('#login_senha', 'Enter');
    await page.waitForSelector('#cadastro_status_logado:not([hidden])', { state: 'attached' });
    await page.waitForTimeout(800);
}

export const estado = (page, expr) => page.evaluate(`import('/js/state.js').then(m => ${expr})`);
