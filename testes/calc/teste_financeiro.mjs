// Financeiro do sistema: resumo do mês, acerto entre sócios, situação do cliente e CPF/CNPJ.
import assert from 'node:assert/strict';
import { resumoPeriodo, acertoSocios, situacaoCliente, receitaMensal, limitesMes, documentoValido, fmtDocumento } from '../../js/financeiro.js';
const perto = (a, b, m) => assert.ok(Math.abs(a - b) < 0.005, `${m}: ${a} ≠ ${b}`);

// conta conferida à mão
const H = { id: 'h', nome: 'Hugo', percentual: 50 }, G = { id: 'g', nome: 'Guilherme', percentual: 50 };
const recebimentos = [{ data: '2026-11-03', valor: 450 }, { data: '2026-10-28', valor: 200 }];
const lancamentos = [
  { data: '2026-11-05', tipo: 'despesa', valor: 100, socio_id: 'h' },   // servidor, Hugo pagou do bolso
  { data: '2026-11-06', tipo: 'despesa', valor: 50, socio_id: null },   // domínio, pago pelo caixa
  { data: '2026-11-07', tipo: 'receita', valor: 300 },                  // implantação cobrada à parte
  { data: '2026-11-08', tipo: 'retirada', valor: 200, socio_id: 'g' },
];
let r = resumoPeriodo({ lancamentos, recebimentos, ...limitesMes('2026-11') });
assert.equal(r.cobrancas, 450); assert.equal(r.receitasManuais, 300); assert.equal(r.receitas, 750);
assert.equal(r.despesas, 150); assert.equal(r.resultado, 600); assert.equal(r.retiradas, 200);
r = resumoPeriodo({ lancamentos, recebimentos, ...limitesMes('2026-10') }); assert.equal(r.receitas, 200); assert.equal(r.despesas, 0);

// acumulado: receitas 950, despesas 150, resultado 800 → 400 cada
// Hugo: 400 + 100 (pagou) - 0 = 500; Guilherme: 400 - 200 = 200; caixa: 950 - 50 - 200 = 700 = 500 + 200
let a = acertoSocios({ lancamentos, recebimentos, socios: [H, G] });
const [h, g] = a.socios;
assert.equal(h.parte, 400); assert.equal(h.pagou, 100); assert.equal(h.saldo, 500);
assert.equal(g.parte, 400); assert.equal(g.retirou, 200); assert.equal(g.saldo, 200);
assert.equal(a.caixa, 700); perto(h.saldo + g.saldo, a.caixa, 'soma dos saldos = caixa');

// percentuais diferentes e centavos: a soma das partes sempre bate com o resultado
a = acertoSocios({ recebimentos: [{ data: '2026-11-01', valor: 100.01 }], socios: [{ id: 'a', nome: 'A', percentual: 33.33 }, { id: 'b', nome: 'B', percentual: 33.33 }, { id: 'c', nome: 'C', percentual: 33.34 }] });
perto(a.socios.reduce((s, x) => s + x.parte, 0), 100.01, 'partes somam o resultado');
// sócio inativo não recebe parte nova, mas o que pagou/retirou continua contando
a = acertoSocios({ recebimentos: [{ data: '2026-11-01', valor: 100 }], lancamentos: [{ tipo: 'retirada', valor: 10, socio_id: 'x', data: '2026-11-02' }],
  socios: [{ id: 'x', nome: 'Ex', percentual: 0, ativo: false }, { id: 'y', nome: 'Y', percentual: 100 }] });
assert.equal(a.socios[0].parte, 0); assert.equal(a.socios[0].saldo, -10); assert.equal(a.socios[1].parte, 100); assert.equal(a.caixa, 90);
// prejuízo divide também
a = acertoSocios({ lancamentos: [{ tipo: 'despesa', valor: 80, data: '2026-11-01' }], socios: [H, G] });
assert.equal(a.socios[0].parte, -40); assert.equal(a.caixa, -80);
// sem nada
a = acertoSocios({ socios: [H, G] }); assert.equal(a.caixa, 0); assert.equal(a.socios[0].saldo, 0);

// situação do cliente
assert.equal(situacaoCliente('2026-12-30', '2026-11-10').rotulo, 'Em dia');
assert.equal(situacaoCliente('2026-11-15', '2026-11-10').rotulo, 'Vence em 5 dias');
assert.equal(situacaoCliente('2026-11-11', '2026-11-10').rotulo, 'Vence em 1 dia');
assert.equal(situacaoCliente('2026-11-10', '2026-11-10').rotulo, 'Vence hoje');
assert.equal(situacaoCliente('2026-11-07', '2026-11-10').rotulo, 'Em carência');
assert.equal(situacaoCliente('2026-11-01', '2026-11-10').rotulo, 'Vencido');
assert.equal(receitaMensal([{ mensal: 200, pago_ate: '2026-12-01' }, { mensal: 450, pago_ate: '2026-11-09' }, { mensal: 99.9, pago_ate: '2026-11-10' }, { mensal: 50, pago_ate: '2027-01-01', bloqueada: true }], '2026-11-10'), 299.9);
assert.deepEqual(limitesMes('2026-02'), { ini: '2026-02-01', fim: '2026-02-28' }); assert.equal(limitesMes('2028-02').fim, '2028-02-29');

// CPF/CNPJ (os mesmos casos do teste do banco)
for (const d of ['529.982.247-25', '52998224725', '11.222.333/0001-81', '111.444.777-35']) assert.ok(documentoValido(d), d);
for (const d of ['529.982.247-24', '111.111.111-11', '11.222.333/0001-82', '00000000000000', '1234', '', null, 'abc']) assert.ok(!documentoValido(d), String(d));
// confere contra um gerador independente: 2.000 CPFs com DV calculado do jeito "clássico"
for (let i = 0; i < 2000; i++) {
  const b = String(100000000 + i * 4999).slice(0, 9).split('').map(Number);
  const dv = (arr) => { const s = arr.reduce((acc, n, k) => acc + n * (arr.length + 1 - k), 0); const x = 11 - (s % 11); return x >= 10 ? 0 : x; };
  const d1 = dv(b), d2 = dv([...b, d1]); const cpf = b.join('') + d1 + d2;
  if (/^(\d)\1{10}$/.test(cpf)) continue;
  assert.ok(documentoValido(cpf), cpf); assert.ok(!documentoValido(cpf.slice(0, 10) + ((d2 + 1) % 10)), 'DV trocado ' + cpf);
}
assert.equal(fmtDocumento('52998224725'), '529.982.247-25'); assert.equal(fmtDocumento('11222333000181'), '11.222.333/0001-81');
// valores em reais no padrão brasileiro (campos de custo, preço e despesa)
const { numMoeda, moedaCampo } = await import('../../js/util.js');
for (const [t, v] of [['1.250,50', 1250.5], ['1250,50', 1250.5], ['R$ 1.250,50', 1250.5], ['r$1.250', 1250], ['1.250', 1250], ['1.000.000,00', 1000000],
  ['9,5', 9.5], ['9.5', 9.5], ['9.50', 9.5], ['3200', 3200], ['0,99', 0.99], [' 12,30 ', 12.3], [1250.5, 1250.5]]) assert.equal(numMoeda(t), v, String(t));
for (const t of ['abc', '', null, '1.25,00', '1,234', '1.2345', '12,345', '1,250.50', '-5', '1..000', '9,']) assert.ok(Number.isNaN(numMoeda(t)), 'deveria recusar: ' + t);
assert.equal(moedaCampo(1250.5), '1.250,50'); assert.equal(moedaCampo(null), ''); assert.equal(numMoeda(moedaCampo(3940)), 3940);
console.log('RESULTADO: TUDO OK (financeiro)');
