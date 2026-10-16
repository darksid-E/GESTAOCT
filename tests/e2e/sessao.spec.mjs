import { test, expect } from '@playwright/test';
import { usarSupabaseFalso, criarBanco, entrar } from './supabase-falso.mjs';

test('token vencido no meio do uso: renova e repete a requisição (sem "JWT expired")', async ({ page }) => {
    const banco = criarBanco();
    await usarSupabaseFalso(page, banco);
    await entrar(page, 'dev');
    let renovacoes = 0;
    // a partir daqui, o token atual "venceu": a 1ª leitura dá 401; a renovação devolve um token novo válido
    const vencido = Object.keys(banco.tokens).at(-1);
    await page.route('https://fake.supabase.co/rest/v1/reparos**', async (route) => {
        const auth = route.request().headers().authorization || '';
        if (auth.endsWith(vencido)) return route.fulfill({ status: 401, contentType: 'application/json', body: '{"code":"PGRST301","message":"JWT expired"}' });
        return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    });
    await page.route('https://fake.supabase.co/auth/v1/token?grant_type=refresh_token', async (route) => {
        renovacoes++;
        banco.tokens['tok-novo'] = 'u-dev';
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ access_token: 'tok-novo', refresh_token: 'ref-2', expires_in: 3600 }) });
    });
    const resultado = await page.evaluate(() => import('/js/supabase-api.js').then(m => m.listarReparosSupabase()).then(l => `ok:${l.length}`, e => `erro:${e.message}`));
    expect(resultado).toBe('ok:0');
    expect(renovacoes).toBe(1);
});
