import { chamadas, simularFetch } from './ambiente.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { listarTodos, TAMANHO_PAGINA } from '../../js/supabase-api.js';
import { caminhoDaFoto, urlsAssinadas, excluirFotos } from '../../js/fotos.js';
import { CONTROLES } from '../../js/itens-controle.js';
import { state, paginaLiberadaParaPerfil, podeVerPagina, salvarCacheLocal } from '../../js/state.js';

const linhas = (n, inicio = 0) => Array.from({ length: n }, (_, i) => ({ id: inicio + i }));

test('listarTodos pagina até a última página incompleta (sem corte em 1000)', async () => {
    simularFetch((url) => {
        const offset = Number(new URL(url).searchParams.get('offset'));
        return { corpo: offset < 2000 ? linhas(TAMANHO_PAGINA, offset) : linhas(500, offset) };
    });
    const todos = await listarTodos('reparos', 'select=*&order=id_reparo.asc');
    assert.equal(todos.length, 2500);
    assert.deepEqual(chamadas.map(c => new URL(c.url).searchParams.get('offset')), ['0', '1000', '2000']);
    assert.ok(chamadas.every(c => new URL(c.url).searchParams.get('limit') === '1000'));
});

test('listarTodos com exatamente 1000 linhas faz mais uma chamada e para no vazio', async () => {
    simularFetch((url) => ({ corpo: Number(new URL(url).searchParams.get('offset')) === 0 ? linhas(1000) : [] }));
    assert.equal((await listarTodos('maquinas', 'select=*&order=id.desc')).length, 1000);
    assert.equal(chamadas.length, 2);
});

test('caminhoDaFoto reconhece URL pública, assinada e direta; ignora outras', () => {
    const base = 'https://teste.supabase.co/storage/v1/object';
    assert.equal(caminhoDaFoto(`${base}/public/fotos_reparos/reparos/1_antes_a.jpg`), 'reparos/1_antes_a.jpg');
    assert.equal(caminhoDaFoto(`${base}/sign/fotos_reparos/reparos/b%20c.jpg?token=x`), 'reparos/b c.jpg');
    assert.equal(caminhoDaFoto(`${base}/fotos_reparos/reparos/d.jpg`), 'reparos/d.jpg');
    assert.equal(caminhoDaFoto(`${base}/public/outro_bucket/x.jpg`), null);
    assert.equal(caminhoDaFoto(null), null);
});

test('urlsAssinadas troca pelo link assinado e mantém a original se falhar', async () => {
    const a = 'https://teste.supabase.co/storage/v1/object/public/fotos_reparos/reparos/a.jpg';
    const b = 'https://teste.supabase.co/storage/v1/object/public/fotos_reparos/reparos/b.jpg';
    simularFetch(() => ({ corpo: [{ path: 'reparos/a.jpg', signedURL: '/object/sign/fotos_reparos/reparos/a.jpg?token=T' }, { path: 'reparos/b.jpg', error: 'x' }] }));
    const mapa = await urlsAssinadas([a, b, a, null]);
    assert.equal(mapa.get(a), 'https://teste.supabase.co/storage/v1/object/sign/fotos_reparos/reparos/a.jpg?token=T');
    assert.equal(mapa.get(b), b);
    assert.equal(JSON.parse(chamadas[0].opcoes.body).paths.length, 2);
    simularFetch(() => ({ status: 400, corpo: { error: 'bucket público' } }));
    const c = 'https://teste.supabase.co/storage/v1/object/public/fotos_reparos/reparos/c.jpg';
    assert.equal((await urlsAssinadas([c])).get(c), c);
});

test('excluirFotos manda os caminhos para o Storage e ignora URLs de fora', async () => {
    simularFetch(() => ({ corpo: [] }));
    await excluirFotos(['https://teste.supabase.co/storage/v1/object/public/fotos_reparos/reparos/a.jpg', null, 'https://outro.site/x.jpg']);
    assert.equal(chamadas.length, 1);
    assert.equal(chamadas[0].opcoes.method, 'DELETE');
    assert.deepEqual(JSON.parse(chamadas[0].opcoes.body).prefixes, ['reparos/a.jpg']);
    chamadas.length = 0;
    await excluirFotos([null]);
    assert.equal(chamadas.length, 0);
});

test('comporta: desvio fora de 420–480 (limites contam como OK)', () => {
    const st = CONTROLES.comporta.status;
    assert.equal(st({ lado_torre_mm: 420, centro_mm: 480, lado_forno_falso_mm: 450 }), 'OK');
    assert.equal(st({ lado_torre_mm: 419.9, centro_mm: 450, lado_forno_falso_mm: 450 }), 'DESVIO');
    assert.equal(st({ lado_torre_mm: 450, centro_mm: 450, lado_forno_falso_mm: 480.1 }), 'DESVIO');
    assert.equal(st({}), '');
});

test('sapata: desvio fora de 30–45', () => {
    const st = CONTROLES.sapata.status;
    assert.equal(st({ altura_t_mm: 30, altura_m_mm: 45, altura_f_mm: 40 }), 'OK');
    assert.equal(st({ altura_t_mm: 29, altura_m_mm: 40, altura_f_mm: 40 }), 'DESVIO');
});

test('queda de material: Moinha na linha 33, Cain nas 31/32', () => {
    const material = CONTROLES.queda.derivados.material;
    assert.equal(material({ linha: '33B' }), 'Moinha');
    assert.equal(material({ linha: '31A' }), 'Cain');
    assert.equal(material({ linha: '32C', material: 'Cain' }), 'Cain');
});

test('permissões: ver_permissoes precisa ser true; demais páginas liberadas por padrão', () => {
    assert.equal(paginaLiberadaParaPerfil({}, 'permissoes'), false);
    assert.equal(paginaLiberadaParaPerfil({ ver_permissoes: true }, 'permissoes'), true);
    assert.equal(paginaLiberadaParaPerfil({}, 'reparos'), true);
    assert.equal(paginaLiberadaParaPerfil({ ver_reparos: false, isAdmin: true }, 'reparos'), false);   // admin não vê tudo
    state.sessaoAtual = null;
    assert.equal(podeVerPagina('reparos'), false);
});

test('cache local cheio não derruba a carga dos dados', () => {
    const original = localStorage.setItem;
    localStorage.setItem = () => { throw new Error('QuotaExceededError'); };
    state.dbReparos = linhas(10);
    assert.doesNotThrow(() => salvarCacheLocal());
    localStorage.setItem = original;
});
