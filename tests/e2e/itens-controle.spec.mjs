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
    await page.click('#ic_form_salvar');
    await expect(page.locator('#toast_container')).toContainText('Preencha "Turno"');
    await page.selectOption('#ic_f_turno', 'Turno 2');
    await page.selectOption('#ic_f_linha', 'L1');
    await page.fill('#ic_f_lado_torre_mm', '450');
    await page.fill('#ic_f_centro_mm', '419,5');
    await page.fill('#ic_f_lado_forno_falso_mm', '470');
    await expect(page.locator('#ic_status_previa')).toContainText('DESVIO');
    await page.click('#ic_form_salvar');
    await expect.poll(() => banco.controle_comporta.length).toBe(1);
    expect(banco.controle_comporta[0]).toMatchObject({ turno: 'Turno 2', bateria: 'C', maquina: '31C', linha: 'L1', centro_mm: 419.5 });
    await expect(page.locator('#ic_tabela thead th').nth(1)).toHaveText('Turno');
    await expect(page.locator('#ic_tabela tbody tr').first()).toContainText('Turno 2');
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

test('banco: filtro por turno', async ({ page }) => {
    const banco = criarBanco({ controle_sapata: [
        { id: 1, data: new Date().toISOString().slice(0, 10), turno: 'Turno 1', bateria: 'A', maquina: '31A', altura_t_mm: 40, altura_m_mm: 40, altura_f_mm: 40, status: 'OK' },
        { id: 2, data: new Date().toISOString().slice(0, 10), turno: 'Turno 2', bateria: 'A', maquina: '32A', altura_t_mm: 40, altura_m_mm: 40, altura_f_mm: 40, status: 'OK' },
        { id: 3, data: new Date().toISOString().slice(0, 10), turno: null, bateria: 'A', maquina: '33A', altura_t_mm: 40, altura_m_mm: 40, altura_f_mm: 40, status: 'OK' },
    ] });
    await usarSupabaseFalso(page, banco);
    await entrar(page, 'dev');
    await page.click('.nav_btn[data-target="itens_controle"]');
    await page.click('.ic_opcao[data-controle="sapata"]');
    await page.click('#ic_btn_abrir_banco');
    await page.selectOption('#ic_banco_tabela select[data-filtro="turno"]', 'Turno 2');
    await expect(page.locator('#ic_banco_tabela tbody tr')).toHaveCount(1);
    await page.selectOption('#ic_banco_tabela select[data-filtro="turno"]', '-');
    await expect(page.locator('#ic_banco_tabela tbody tr')).toHaveCount(1);
    await expect(page.locator('#ic_banco_tabela tbody tr').first()).toContainText('33A');
});
