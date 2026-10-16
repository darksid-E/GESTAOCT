import { test, expect } from '@playwright/test';
import { usarSupabaseFalso, criarBanco, entrar, hoje, diasAtras } from './supabase-falso.mjs';

const item = (id, setor, equipamento, nome, extra = {}) => ({
    id, setor, equipamento, item: nome, unidade: 'min', parametro: '< 27 MIN', entrada: 'NUMERO', meta_min: null, min_inclusivo: true,
    meta_max: 27, max_inclusivo: false, bateria: 'A', fonte_auto: null, ordem: id, ativo: true, ...extra,
});

test('tempo de ciclo vem automático de Máquinas e registro com mais de 2 dias aparece em branco', async ({ page }) => {
    const banco = criarBanco({
        relatorio_turno_itens: [
            item(1, 'MAQUINAS', '31A', 'Tempo de Ciclo'),
            item(2, 'FGDS', null, 'Média Horária do Particulado', { unidade: 'mg/Nm³', parametro: '< 30', meta_max: 30 }),
        ],
        maquinas: [
            { id: 1, data: hoje(), bateria: 'A', maquina: '31A', tempo_ciclo_min: 24 },
            { id: 2, data: hoje(), bateria: 'A', maquina: '31A', tempo_ciclo_min: 26 },
        ],
        relatorio_turno: [{ id: 9, data: diasAtras(3), bateria: 'A', tipo: 'TURNO', item_id: 2, valor: 20, status: 'OK', origem: 'MANUAL' }],
    });
    await usarSupabaseFalso(page, banco);
    await entrar(page, 'dev');
    await page.click('.nav_btn[data-target="relatorio_turno"]');
    const ciclo = page.locator('.rt_bateria_bloco[data-bateria="A"] .rt_card[data-setor="MAQUINAS"] .rt_item', { hasText: 'Tempo de Ciclo' });
    await expect(ciclo.locator('dd.rt_det_valor').first()).toContainText('25');
    await expect(ciclo).toContainText(/auto/i);
    const particulado = page.locator('.rt_bateria_bloco[data-bateria="A"] .rt_card[data-setor="FGDS"] .rt_item').first();
    await expect(particulado.locator('dd.rt_det_valor').first()).toHaveText('');
});
