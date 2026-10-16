import './ambiente.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { esc, formatarDataBR, calcularSituacaoPrazo, formatarStatus } from '../../js/utils.js';

test('esc escapa os 5 caracteres perigosos e trata vazio', () => {
    assert.equal(esc('<img src=x onerror="alert(1)">'), '&lt;img src=x onerror=&quot;alert(1)&quot;&gt;');
    assert.equal(esc("O'Neil & <b>"), 'O&#39;Neil &amp; &lt;b&gt;');
    assert.equal(esc(null), '');
    assert.equal(esc(undefined), '');
    assert.equal(esc(0), '0');
});

test('formatarDataBR converte aaaa-mm-dd e trata vazio', () => {
    assert.equal(formatarDataBR('2026-10-16'), '16/10/2026');
    assert.equal(formatarDataBR(''), '-');
    assert.equal(formatarDataBR(null), '-');
});

test('formatarStatus traduz os códigos e mantém desconhecidos', () => {
    assert.equal(formatarStatus('em_andamento'), 'Andamento');
    assert.equal(formatarStatus('xyz'), 'xyz');
});

test('calcularSituacaoPrazo cobre sem prazo, atrasado, no prazo e concluído', () => {
    assert.equal(calcularSituacaoPrazo({}).codigo, 'sem_prazo');
    assert.equal(calcularSituacaoPrazo({ prazo: '2000-01-01', andamento: 'inspecao' }).codigo, 'atrasado');
    assert.equal(calcularSituacaoPrazo({ prazo: '2999-01-01', andamento: 'inspecao' }).codigo, 'no_prazo');
    assert.equal(calcularSituacaoPrazo({ prazo: '2026-01-10', data_fim: '2026-01-12', andamento: 'concluido' }).codigo, 'concluido_atrasado');
    assert.equal(calcularSituacaoPrazo({ prazo: '2026-01-10', data_fim: '2026-01-09', andamento: 'concluido' }).codigo, 'concluido_no_prazo');
});
