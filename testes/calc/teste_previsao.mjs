// Previsão de despesca: casos que já quebraram a Início em produção.
// Rodar: node testes/calc/teste_previsao.mjs
import assert from 'node:assert/strict';
import { previsaoDespesca } from '../../js/calc.js';

const r = (pm) => ({ ultimo_peso_medio_kg: pm, ultima_biometria: '2026-10-22', mortos: 0 });

// Tanque 7 da Fazenda do Fábio (2026-11-03): 19196,10 kg ÷ 12465 peixes = 1,5399999999999998 no JS,
// biometria 1,54 kg. O "crescimento" de 2e-16 kg jogava a data para trilhões de anos e dava "Invalid Date".
const t7 = { data_entrada: '2026-07-17', quantidade_inicial: 12465, peso_inicial_kg: '19196.10' };
assert.equal(previsaoDespesca(t7, r('1.5400000000000000'), 3, '2026-11-03').estado, 'sem-dado');

// Crescimento real continua prevendo a data: 1,5 → 2,0 kg em 100 dias (5 g/dia), faltam 200 dias até 3 kg
const lote = { data_entrada: '2026-01-01', quantidade_inicial: 1000, peso_inicial_kg: 1500 };
const p = previsaoDespesca(lote, { ultimo_peso_medio_kg: 2, ultima_biometria: '2026-04-11', mortos: 0 }, 3, '2026-05-01');
assert.equal(p.estado, 'previsto');
assert.equal(p.data, '2026-10-28');

// Crescimento quase zero (1 g em 1 ano) para 30 kg: data longe demais vira "sem-dado", sem erro
const lento = { data_entrada: '2025-01-01', quantidade_inicial: 1, peso_inicial_kg: 1 };
assert.equal(previsaoDespesca(lento, { ultimo_peso_medio_kg: 1.000001, ultima_biometria: '2026-01-01', mortos: 0 }, 30, '2026-01-02').estado, 'sem-dado');

console.log('RESULTADO: TUDO OK (previsão de despesca)');
