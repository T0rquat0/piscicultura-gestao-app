// Contas da despesca, conferidas com o relatório real da Fazenda São Carlos (Tanque Piranha, 05/11/2026).
// Rodar: node testes/calc/teste_despesca.mjs
import assert from 'node:assert/strict';
import { indicadoresDespesca, calcularLote, vivosDoLote, fimDoLote, previsaoDespesca } from '../../js/calc.js';

const perto = (a, b, m, d = 0.005) => assert.ok(Math.abs(a - b) <= d, `${m}: ${a} ≠ ${b}`);

// 1) os números do relatório em papel
const piranha = { quantidade: 2263, peso_bruto_kg: 9547, peso_liquido_kg: 9356 };
const i = indicadoresDespesca(piranha, 2.3);
assert.equal(i.difKg, 191);
perto(i.difPct, 2.0, '% da diferença', 0.05);
perto(i.medioBrutoKg, 4.22, 'médio bruto');
perto(i.medioLiquidoKg, 4.13, 'médio líquido');
perto(i.peixesHa, 984, 'peixes/ha', 0.5);

// sem peso líquido ou sem área, não inventa número
const sem = indicadoresDespesca({ quantidade: 100, peso_bruto_kg: 200, peso_liquido_kg: null }, null);
assert.equal(sem.medioLiquidoKg, null); assert.equal(sem.difKg, null); assert.equal(sem.peixesHa, null);
assert.equal(sem.medioBrutoKg, 2);

const lote = { data_entrada: '2026-01-01', quantidade_inicial: 1000, peso_inicial_kg: 100, ativo: true };
const bios = [{ data: '2026-06-01', peso_amostra_kg: 20, quantidade_amostrada: 10 }]; // 2 kg por peixe
const rac = [{ data: '2026-03-01', quantidade_kg: 2000 }];
const mort = [{ data: '2026-02-01', quantidade: 100 }];
const D = '2026-06-10';

// 2) sem despesca, nada muda
const base = calcularLote(lote, bios, mort, rac, D, null);
assert.equal(base.vivos, 900); assert.equal(base.biomassaAtual, 1800); assert.equal(base.ganhoBiomassa, 1700);
assert.equal(base.sobrevivencia, 90); assert.equal(base.despescados, 0);

// 3) parcial: peixe sai dos vivos, o peso retirado continua contando como produção (a conversão não piora)
const parcial = [{ data: '2026-06-05', tipo: 'parcial', quantidade: 300, peso_bruto_kg: 600 }];
const cp = calcularLote(lote, bios, mort, rac, D, null, parcial);
assert.equal(cp.vivos, 600); assert.equal(cp.biomassaAtual, 1200); assert.equal(cp.ganhoBiomassa, 1700);
assert.equal(cp.ca, base.ca, 'parcial no peso da biometria não muda a conversão');
assert.equal(cp.sobrevivencia, 90, 'quem foi retirado sobreviveu');
assert.equal(cp.despescados, 300); assert.equal(cp.pesoDespescado, 600);

// 4) total: números reais, lote fechado
const fechado = { ...lote, ativo: false };
const totais = [...parcial, { data: '2026-06-20', tipo: 'total', quantidade: 590, peso_bruto_kg: 1300 }];
const ct = calcularLote(fechado, bios, mort, rac, '2026-06-20', null, totais);
assert.equal(ct.vivos, 0); assert.equal(ct.biomassaAtual, 0);
assert.equal(ct.ganhoBiomassa, 600 + 1300 - 100);
perto(ct.ca, 2000 / 1800, 'conversão real');
perto(ct.sobrevivencia, 89, 'sobrevivência real (890 de 1000)');
assert.equal(fimDoLote(fechado, bios, mort, rac, '2026-12-31', totais), '2026-06-20', 'a data de fim é a da despesca total');

// total sem nenhuma biometria ainda calcula a conversão
const sb = calcularLote(fechado, [], [], rac, D, null, [{ data: D, tipo: 'total', quantidade: 900, peso_bruto_kg: 2100 }]);
perto(sb.ca, 1, 'conversão sem biometria');

// contagem real acima da entrada não passa de 100%
assert.equal(calcularLote(fechado, [], [], [], D, null, [{ data: D, tipo: 'total', quantidade: 1200, peso_bruto_kg: 100 }]).sobrevivencia, 100);

// lote reaberto depois de um total por engano volta a ser estimado
assert.equal(calcularLote(lote, bios, [], [], D, null, [{ data: D, tipo: 'total', quantidade: 100, peso_bruto_kg: 200 }]).vivos, 900);

// 5) resumo do banco: retirados saem dos vivos em todas as telas; nunca negativo; banco sem o sql/20 continua igual
assert.equal(vivosDoLote(lote, { mortos: 100, despescados: 300 }), 600);
assert.equal(vivosDoLote(lote, { mortos: 900, despescados: 300 }), 0);
assert.equal(vivosDoLote(lote, { mortos: 100 }), 900);
assert.equal(vivosDoLote(lote, undefined), 1000);
assert.equal(previsaoDespesca(lote, { ultimo_peso_medio_kg: 2, ultima_biometria: '2026-06-01', mortos: 100, despescados: 300 }, 3, D).biomassaKg, 1800);

console.log('RESULTADO: TUDO OK (despesca)');
