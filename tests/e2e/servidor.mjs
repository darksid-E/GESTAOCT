// Servidor estático mínimo para os testes (sem dependências). O supabase-config.js
// é substituído por um falso: o app aponta para fake.supabase.co, interceptado no teste.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const TIPOS = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json' };
const CONFIG_FALSA = "window.SUPABASE_CONFIG = Object.freeze({ url: 'https://fake.supabase.co/rest/v1', key: 'sb_publishable_teste' });";

http.createServer(async (req, res) => {
    const caminho = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (caminho.endsWith('/supabase-config.js')) { res.writeHead(200, { 'Content-Type': 'text/javascript' }); return res.end(CONFIG_FALSA); }
    const arquivo = path.join(RAIZ, caminho === '/' ? 'index.html' : caminho);
    if (!arquivo.startsWith(RAIZ)) { res.writeHead(403); return res.end(); }
    try {
        const conteudo = await readFile(arquivo);
        res.writeHead(200, { 'Content-Type': TIPOS[path.extname(arquivo)] || 'application/octet-stream' });
        res.end(conteudo);
    } catch {
        res.writeHead(404); res.end('não encontrado');
    }
}).listen(4173, '127.0.0.1');
