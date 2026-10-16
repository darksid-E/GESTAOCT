import { test, expect } from '@playwright/test';
import { usarSupabaseFalso, criarBanco, entrar, estado } from './supabase-falso.mjs';

const FOTO = 'https://fake.supabase.co/storage/v1/object/public/fotos_reparos/reparos/1_antes_a.jpg';
const reparo = (id, extra = {}) => ({
    id_reparo: String(id), data_registro: '10/10/2026', criado_por: 'TESTE', bateria: 'A', bloco: '1', forno: '01', lado: 'LC',
    reparo_no: 'Forno', id_referencia: '01 - A1 - LC', andamento: 'inspecao', desc_problema: 'TRINCA', observacao: '', ...extra,
});

test('mais de 1000 reparos: carrega todos (paginação), sem corte silencioso', async ({ page }) => {
    const banco = criarBanco({ reparos: Array.from({ length: 2500 }, (_, i) => reparo(i + 1)) });
    await usarSupabaseFalso(page, banco);
    await entrar(page, 'dev');
    expect(await estado(page, 'm.state.dbReparos.length')).toBe(2500);
});

test('texto com HTML (XSS) aparece como texto na tabela e no histórico', async ({ page }) => {
    const ataque = '<img src=x onerror="window.__xss=1">';
    await usarSupabaseFalso(page, criarBanco({ reparos: [reparo(1, { desc_problema: ataque, observacao: '<b>negrito</b>' })] }));
    await entrar(page, 'dev');
    await page.click('.nav_btn[data-target="reparos"]');
    await page.click('#btn_abrir_tabela');
    await expect(page.locator('#tbody_banco')).toContainText('<img src=x');
    expect(await page.locator('#tbody_banco img').count()).toBe(0);
    expect(await page.locator('#tbody_banco b').count()).toBe(0);
    expect(await page.evaluate(() => window.__xss)).toBeUndefined();
});

test('excluir pede confirmação no app; cancelar não apaga; confirmar apaga o reparo e a foto', async ({ page }) => {
    const banco = criarBanco({ reparos: [reparo(7, { foto_antes: FOTO })] });
    banco.fotos.add('reparos/1_antes_a.jpg');
    await usarSupabaseFalso(page, banco);
    await entrar(page, 'dev');
    await page.click('.nav_btn[data-target="reparos"]');
    await page.click('#btn_abrir_tabela');
    await page.click('#tbody_banco button.icone_excluir');
    await expect(page.locator('.dialogo_overlay.active')).toBeVisible();
    await page.click('.dialogo_overlay [data-resposta="nao"]');
    expect(banco.reparos.length).toBe(1);

    await page.click('#tbody_banco button.icone_excluir');
    await page.click('.dialogo_overlay [data-resposta="sim"]');
    await expect.poll(() => banco.reparos.length).toBe(0);
    await expect.poll(() => banco.fotos.size).toBe(0);
});

test('histórico mostra a foto por link assinado (funciona com bucket privado)', async ({ page }) => {
    await usarSupabaseFalso(page, criarBanco({ reparos: [reparo(3, { foto_antes: FOTO })] }));
    await entrar(page, 'dev');
    await page.click('.nav_btn[data-target="reparos"]');
    await page.click('#btn_abrir_tabela');
    await page.click('#tbody_banco button.icone_editar');
    const thumb = page.locator('#lista_historico .hist_foto_thumb').first();
    await expect(thumb).toHaveAttribute('src', /object\/sign\/fotos_reparos\/reparos\/1_antes_a\.jpg\?token=assinado/);
    // a URL guardada continua a original (não grava o link temporário)
    expect(await page.locator('#img_preview_antes').getAttribute('data-foto')).toBe(FOTO);
});
