import { test, expect } from '@playwright/test';
import { usarSupabaseFalso, criarBanco, entrar } from './supabase-falso.mjs';

test('comporta: prévia de DESVIO fora de 420–480 e lançamento salvo com a máquina da bateria', async ({ page }) => {
    const banco = criarBanco();
    await usarSupabaseFalso(page, banco);
    await entrar(page, 'dev');
    await page.click('.nav_btn[data-target="itens_controle"]');
    await page.click('.ic_opcao[data-controle="comporta"]');
    await page.click('#ic_btn_novo');
    await page.selectOption('#ic_f_bateria', 'C');
    await expect(page.locator('#ic_f_maquina option')).toHaveText(['31C', '33C', '32C']);
    await page.selectOption('#ic_f_linha', 'L1');
    await page.fill('#ic_f_lado_torre_mm', '450');
    await page.fill('#ic_f_centro_mm', '419,5');
    await page.fill('#ic_f_lado_forno_falso_mm', '470');
    await expect(page.locator('#ic_status_previa')).toContainText('DESVIO');
    await page.click('#ic_form_salvar');
    await expect.poll(() => banco.controle_comporta.length).toBe(1);
    expect(banco.controle_comporta[0]).toMatchObject({ bateria: 'C', maquina: '31C', linha: 'L1', centro_mm: 419.5 });
});

test('truck: na 33 só truck máquina 01/02 e freio 01/02', async ({ page }) => {
    await usarSupabaseFalso(page, criarBanco());
    await entrar(page, 'dev');
    await page.click('.nav_btn[data-target="itens_controle"]');
    await page.click('.ic_opcao[data-controle="truck"]');
    await page.click('#ic_btn_novo');
    await expect(page.locator('#ic_f_truck_hopper_01')).toBeVisible();
    await page.selectOption('#ic_f_maquina', '33A');
    await expect(page.locator('#ic_f_truck_hopper_01')).toBeHidden();
    await expect(page.locator('#ic_f_freio_03')).toBeHidden();
    await expect(page.locator('#ic_f_freio_02')).toBeVisible();
});
