// Custo completo e lucro por ciclo: rateio por peso produzido e fechamento.
import assert from 'node:assert/strict';
import { calcularLote, pesoProduzido, ratearDespesas, fecharCiclo } from '../../js/calc.js';
const perto = (a, b, m) => assert.ok(Math.abs(a - b) < 0.01, `${m}: ${a} ≠ ${b}`);

// rateio por peso: 3.000 kg e 1.000 kg dividem 1.000 reais em 750 e 250
const c = [{ id: 'a', ini: '2026-01-01', fim: '2026-06-30', peso: 3000 }, { id: 'b', ini: '2026-01-01', fim: '2026-03-31', peso: 1000 }];
let r = ratearDespesas([{ data: '2026-02-01', valor: 1000 }], c);
assert.deepEqual(r.porLote, { a: 750, b: 250 }); assert.equal(r.semRateio, 0);
// só quem estava em cultivo na data paga
r = ratearDespesas([{ data: '2026-05-01', valor: 400 }], c); assert.deepEqual(r.porLote, { a: 400 });
// limites da data entram
r = ratearDespesas([{ data: '2026-03-31', valor: 100 }], c); perto(r.porLote.b, 25, 'último dia');
// sem lote na data: não some, fica separado
r = ratearDespesas([{ data: '2027-01-01', valor: 90 }], c); assert.deepEqual(r.porLote, {}); assert.equal(r.semRateio, 90);
// lote sem peso produzido não recebe e não divide por zero
r = ratearDespesas([{ data: '2026-02-01', valor: 50 }], [{ id: 'z', ini: '2026-01-01', fim: '2026-12-31', peso: 0 }]); assert.equal(r.semRateio, 50);
// a soma do que foi dividido é igual ao total
r = ratearDespesas([{ data: '2026-02-01', valor: 1234.56 }, { data: '2026-02-02', valor: '99.9' }], [...c, { id: 'c', ini: '2026-01-15', fim: '2026-04-01', peso: 777 }]);
perto(Object.values(r.porLote).reduce((a, b) => a + b, 0), 1334.46, 'soma do rateio');

// ciclo completo, conferido à mão
const lote = { data_entrada: '2026-01-01', quantidade_inicial: 1000, peso_inicial_kg: 100, ativo: false };
const rac = [{ data: '2026-03-01', quantidade_kg: 2000 }];
const desp = [{ data: '2026-06-01', tipo: 'total', quantidade: 950, peso_bruto_kg: 2000, preco_kg: 10 }];
const cc = calcularLote(lote, [], [], rac, '2026-06-01', 4, desp); // ração a R$ 4/kg
assert.equal(pesoProduzido(cc), 1900); assert.equal(cc.custoRacao, 8000); assert.equal(cc.receita, 20000);
let f = fecharCiclo({ c: cc, custoAlevino: 1500, despesas: 2500, fechado: true });
assert.equal(f.custoTotal, 12000); assert.equal(f.lucro, 8000); perto(f.margem, 0.4, 'margem'); perto(f.custoKg, 6, 'custo/kg');
assert.equal(f.completo, true); assert.deepEqual(f.faltando, []);
// prejuízo é mostrado negativo
f = fecharCiclo({ c: cc, custoAlevino: 1500, despesas: 15000, fechado: true }); assert.equal(f.lucro, -4500);
// alevino de custo zero é informação, não falta
f = fecharCiclo({ c: cc, custoAlevino: 0, despesas: 0, fechado: true }); assert.equal(f.completo, true);

// o que falta é avisado e não vira zero
f = fecharCiclo({ c: cc, custoAlevino: null, despesas: 0, fechado: true }); assert.equal(f.completo, false); assert.ok(f.faltando.includes('custo do alevino'));
const semP = calcularLote(lote, [], [], rac, '2026-06-01', null, [{ ...desp[0], preco_kg: null }]);
f = fecharCiclo({ c: semP, custoAlevino: 1, despesas: 0, fechado: true }); assert.equal(f.lucro, null); assert.equal(f.margem, null);
assert.ok(f.faltando.includes('preço de venda na despesca') && f.faltando.includes('valor pago nas compras de ração'));
const parte = calcularLote(lote, [], [], rac, '2026-06-01', 4, [desp[0], { ...desp[0], tipo: 'parcial', preco_kg: null }]);
f = fecharCiclo({ c: parte, custoAlevino: 1, despesas: 0, fechado: true }); assert.ok(f.faltando.includes('preço em 1 despesca')); assert.equal(f.completo, false);
// lote ativo nunca é "completo"
f = fecharCiclo({ c: cc, custoAlevino: 1, despesas: 0, fechado: false }); assert.equal(f.completo, false);

console.log('RESULTADO: TUDO OK (lucro)');
