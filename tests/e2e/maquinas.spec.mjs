import { test, expect } from '@playwright/test';
import { usarSupabaseFalso, criarBanco, entrar } from './supabase-falso.mjs';

test('máquina 33 mostra só ciclo e óleo; 31/32 ligam altura e perfil', async ({ page }) => {
    const banco = criarBanco();
    await usarSupabaseFalso(page, banco);
    await entrar(page, 'dev');
    await page.click('.nav_btn[data-target="maquinas"]');
    await page.click('#btn_abrir_manual_maquina');
    for (const [altura, perfil] of [['810', '2 camadas'], ['900', 'reduzida'], ['950', 'carga baixa'], ['1000', 'normal 1'], ['1050', 'normal 2']]) {
        await page.selectOption('#maquina_altura_programada', altura);
        await expect(page.locator('#maquina_perfil_carga')).toHaveValue(perfil);
    }
    await page.selectOption('#maquina_maquina', '33A');
    await expect(page.locator('#maquina_altura_programada')).toBeHidden();
    await expect(page.locator('#maquina_frontal_dir')).toBeHidden();
    await page.fill('#maquina_tempo_ciclo', '21,5'.replace(',', '.'));
    await page.fill('#maquina_nivel_oleo', '60');
    await page.click('#btn_salvar_maquina');
    await expect.poll(() => banco.maquinas.length).toBe(1);
    expect(banco.maquinas[0]).toMatchObject({ maquina: '33A', tempo_ciclo_min: 21.5, nivel_oleo_pct: 60, altura_programada: null, perfil_carga: null });
});
