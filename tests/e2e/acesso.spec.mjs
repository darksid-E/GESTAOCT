import { test, expect } from '@playwright/test';
import { usarSupabaseFalso, criarBanco, entrar } from './supabase-falso.mjs';

const visivel = (page, alvo) => page.locator(`.nav_btn[data-target="${alvo}"]`).isVisible();
const aba = (page, alvo) => page.locator(`.nav_btn[data-target="${alvo}"]`);

test('sem login só aparece a aba de Login', async ({ page }) => {
    await usarSupabaseFalso(page, criarBanco());
    await page.goto('/index.html');
    await expect(aba(page, 'cadastro')).toBeVisible();
    await expect(aba(page, 'reparos')).toBeHidden();
    await expect(aba(page, 'itens_controle')).toBeHidden();
});

test('dev vê Permissões; leitor não vê Permissões nem o botão de novo reparo', async ({ browser }) => {
    const dev = await browser.newPage();
    await usarSupabaseFalso(dev, criarBanco());
    await entrar(dev, 'dev');
    expect(await visivel(dev, 'permissoes')).toBe(true);
    expect(await visivel(dev, 'itens_controle')).toBe(true);

    const leitor = await browser.newPage();
    await usarSupabaseFalso(leitor, criarBanco());
    await entrar(leitor, 'leitor');
    expect(await visivel(leitor, 'permissoes')).toBe(false);
    await leitor.click('.nav_btn[data-target="reparos"]');
    await expect(leitor.locator('#btn_abrir_manual')).toBeHidden();
});

test('cadastro com email fora da Ternium mostra mensagem clara (recusa vem do banco)', async ({ page }) => {
    await usarSupabaseFalso(page, criarBanco());
    await page.goto('/index.html');
    await page.click('[data-auth-ir="cadastro"]');
    // a tela também barra; aqui o teste fura a validação da tela para simular chamada direta
    await page.evaluate(() => { document.getElementById('cad_email').value = 'x@ternium.com'; });
    await page.fill('#cad_nome', 'Ana'); await page.fill('#cad_sobrenome', 'Lima'); await page.fill('#cad_matricula', '9');
    await page.fill('#cad_senha', 'senha123'); await page.fill('#cad_senha_confirma', 'senha123');
    await page.route('https://fake.supabase.co/auth/v1/signup**', r => r.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ msg: 'Database error saving new user' }) }));
    await page.press('#cad_senha_confirma', 'Enter');
    await expect(page.locator('#msg_cadastro')).toContainText('@ternium.com');
});
