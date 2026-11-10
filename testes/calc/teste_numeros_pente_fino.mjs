// Pente fino dos números (10/11/2026): cada conta conferida à mão.
// Rodar: node testes/calc/teste_numeros_pente_fino.mjs
import assert from 'node:assert/strict';
import { calcularLote, avisoPesoMedio, vivosDoLote, situacaoEstoque, sugestaoRacao } from '../../js/calc.js';
import { pesoMedioTxt } from '../../js/util.js';
import { TAXA_RACAO } from '../../js/config.js';

const perto = (a, b, m, d = 0.005) => assert.ok(Math.abs(a - b) <= d, `${m}: ${a} ≠ ${b}`);
const U = 'u';

// 1) Lote normal (começou no app): 10.000 × 50 g = 500 kg; 10.000 kg de ração; pesagem 0,8 kg; 500 mortos
//    vivos 9.500 × 0,8 = 7.600 kg; ganho 7.600 − 500 = 7.100 kg; CA = 10.000 ÷ 7.100 = 1,408
{
  const lote = { data_entrada: '2026-06-01', quantidade_inicial: 10000, peso_inicial_kg: 500, ativo: true };
  const bios = [{ data: '2026-09-01', peso_amostra_kg: 40, quantidade_amostrada: 50 }];
  const mort = [{ data: '2026-07-01', quantidade: 500 }];
  const rac = [{ data: '2026-06-02', quantidade_kg: 4000 }, { data: '2026-08-01', quantidade_kg: 6000 }];
  const c = calcularLote(lote, bios, mort, rac, '2026-09-01');
  assert.equal(c.vivos, 9500);
  perto(c.biomassaAtual, 7600, 'biomassa');
  perto(c.ganhoBiomassa, 7100, 'ganho');
  perto(c.ca, 1.408, 'CA lote normal', 0.001);
  perto(c.sobrevivencia, 95, 'sobrevivência');
  perto(c.gpd, 750 / 92, 'ganho diário: (800 − 50 g) ÷ 92 dias = 8,15 g/dia', 0.01);
  assert.equal(c.caAguardaPesagem, false);
}

// 2) Lote "em andamento" (o caso do 0,02): entrou em 01/06 com 300 g, cadastrado no app em 10/11 com 1,54 kg,
//    e só a ração de 10/11 lançada. Antes: 300 kg ÷ ~15.400 kg = 0,02. Agora: espera a próxima pesagem.
{
  const lote = { data_entrada: '2026-06-01', quantidade_inicial: 12465, peso_inicial_kg: 3739.5, ativo: true };
  const bios = [{ data: '2026-11-10', peso_amostra_kg: 1.54, quantidade_amostrada: 1 }];
  const rac = [{ data: '2026-11-10', quantidade_kg: 300 }];
  const c = calcularLote(lote, bios, [], rac, '2026-11-10');
  assert.equal(c.ca, null, 'sem pesagem depois do início no app, não inventa conversão');
  assert.equal(c.caAguardaPesagem, true);
  assert.equal(c.custoKgProduzido, null);
}

// 3) O mesmo lote um mês depois: pesagem de 10/12 com 20 peixes = 35 kg (1,75 kg); 35 mortos em 15/11;
//    ração de 10/11 a 10/12 = 300 + 8.000 = 8.300 kg.
//    vivos na base 12.465 × 1,54 = 19.196,1 kg; agora 12.430 × 1,75 = 21.752,5 kg; ganho 2.556,4 kg
//    CA = 8.300 ÷ 2.556,4 = 3,247
{
  const lote = { data_entrada: '2026-06-01', quantidade_inicial: 12465, peso_inicial_kg: 3739.5, ativo: true };
  const bios = [{ data: '2026-11-10', peso_amostra_kg: 1.54, quantidade_amostrada: 1 }, { data: '2026-12-10', peso_amostra_kg: 35, quantidade_amostrada: 20 }];
  const mort = [{ data: '2026-11-15', quantidade: 35 }];
  const rac = [{ data: '2026-11-10', quantidade_kg: 300 }, { data: '2026-12-01', quantidade_kg: 8000 }, { data: '2026-12-11', quantidade_kg: 999 }];
  const c = calcularLote(lote, bios, mort, rac, '2026-12-11', 3.94);
  perto(c.ca, 8300 / 2556.4, 'CA em andamento', 0.002);
  perto(c.custoKgProduzido, (8300 * 3.94) / 2556.4, 'custo por kg produzido', 0.01);
}

// 4) O caso dos 2.400.000 g: 2.400 digitado em gramas num campo de kg, 1 peixe → avisa a unidade
{
  const lote = { data_entrada: '2026-11-01', quantidade_inicial: 50000, peso_inicial_kg: 100 }; // 2 g
  const t = avisoPesoMedio({ quantidade: 1, pesoTotalKg: 2.4 * 1000, lote, r: null, data: '2026-11-09' });
  assert.ok(t && t.includes('gramas'), `aviso sugere gramas: ${t}`);
  const ok = avisoPesoMedio({ quantidade: 50, pesoTotalKg: 0.4, lote, r: null, data: '2026-11-09' }); // 8 g: normal
  assert.equal(ok, null);
  assert.equal(pesoMedioTxt(1.54), '1,54 kg');
  assert.equal(pesoMedioTxt(0.008), '8 g');
}

// 5) Vivos, estoque e sugestão de ração
{
  const lote = { quantidade_inicial: 12465, peso_inicial_kg: 3739.5 };
  assert.equal(vivosDoLote(lote, { mortos: 35, despescados: 500 }), 11930);
  const s = situacaoEstoque(78 * 25, 22 * 25 * 7);
  assert.equal(Math.floor(s.dias), 3, '78 sacos ÷ 22 por dia = 3,5 dias');
  assert.equal(situacaoEstoque(-25, 0).nivel, 'negativo');
  const sg = sugestaoRacao([{ id: 'l', quantidade_inicial: 12465, peso_inicial_kg: 3739.5, tipo: 'engorda' }], { l: { mortos: 0, ultimo_peso_medio_kg: 1.54 } }, TAXA_RACAO);
  perto(sg.biomassaKg, 19196.1, 'biomassa da sugestão', 0.5);
  perto(sg.kg, 19196.1 * sg.pct / 100, 'sugestão = biomassa × taxa', 0.5);
}
console.log('RESULTADO: TUDO OK (números conferidos à mão)');
