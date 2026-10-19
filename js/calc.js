// Cálculos do relatório de um lote (puros, testáveis em Node)
import { diasEntre } from './util.js';

const soma = (arr, k) => arr.reduce((s, x) => s + Number(x[k] || 0), 0);

export function pesoMedioKg(b) {
  const q = Number(b.quantidade_amostrada);
  return q > 0 ? Number(b.peso_amostra_kg) / q : null;
}

/**
 * lote: {data_entrada, quantidade_inicial, peso_inicial_kg}
 * bios: biometrias ordenadas por data; mort: mortalidade; rac: consumo de ração
 * precoKg: preço médio do kg de ração (R$) ou null
 *
 * Convenções (mostradas no relatório como "estimado"):
 *  - peso_inicial_kg é o peso TOTAL do lote na entrada
 *  - biomassa atual = peixes vivos estimados × peso médio da última biometria
 *  - conversão alimentar = ração fornecida até a última biometria ÷ ganho de biomassa
 */
export function calcularLote(lote, bios, mort, rac, hoje, precoKg = null) {
  const qtdInicial = Number(lote.quantidade_inicial);
  const mortos = soma(mort, 'quantidade');
  const vivos = Math.max(0, qtdInicial - mortos);
  const racaoTotal = soma(rac, 'quantidade_kg');
  const biomassaInicial = Number(lote.peso_inicial_kg);
  const pmInicial = qtdInicial > 0 ? biomassaInicial / qtdInicial : null; // kg

  const ultima = bios.length ? bios[bios.length - 1] : null;
  const pmAtual = ultima ? pesoMedioKg(ultima) : null; // kg
  const biomassaAtual = pmAtual != null ? vivos * pmAtual : null;
  const ganhoBiomassa = biomassaAtual != null ? biomassaAtual - biomassaInicial : null;

  const racaoAteBio = ultima ? soma(rac.filter((r) => r.data <= ultima.data), 'quantidade_kg') : null;
  const ca = ganhoBiomassa != null && ganhoBiomassa > 0 ? racaoAteBio / ganhoBiomassa : null;

  const diasCultivo = Math.max(0, diasEntre(lote.data_entrada, hoje));
  const diasAteBio = ultima ? diasEntre(lote.data_entrada, ultima.data) : null;
  const gpd = pmAtual != null && pmInicial != null && diasAteBio > 0 ? ((pmAtual - pmInicial) * 1000) / diasAteBio : null; // g/dia

  return {
    mortos,
    vivos,
    sobrevivencia: qtdInicial > 0 ? (vivos / qtdInicial) * 100 : null,
    racaoTotal,
    racaoMediaDia: diasCultivo > 0 ? racaoTotal / diasCultivo : null,
    diasCultivo,
    pmInicialG: pmInicial != null ? pmInicial * 1000 : null,
    pmAtualG: pmAtual != null ? pmAtual * 1000 : null,
    dataUltimaBio: ultima ? ultima.data : null,
    biomassaInicial,
    biomassaAtual,
    ganhoBiomassa,
    ca,
    gpd,
    custoRacao: precoKg != null ? racaoTotal * precoKg : null,
  };
}

// Preço médio do kg de ração a partir das compras que têm custo informado
export function precoMedioKg(compras) {
  const com = compras.filter((c) => c.custo_total != null && Number(c.custo_total) > 0);
  const kg = soma(com, 'quantidade_kg');
  return kg > 0 ? soma(com, 'custo_total') / kg : null;
}

// Pontos do gráfico de peso médio (g): entrada + biometrias
export function pontosPeso(lote, bios) {
  const pts = [];
  const qi = Number(lote.quantidade_inicial);
  if (qi > 0) pts.push({ data: lote.data_entrada, g: (Number(lote.peso_inicial_kg) / qi) * 1000, inicial: true });
  for (const b of bios) {
    const pm = pesoMedioKg(b);
    if (pm != null) pts.push({ data: b.data, g: pm * 1000 });
  }
  return pts;
}
