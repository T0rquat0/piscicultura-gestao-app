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

// Evolução entre biometrias: peso médio (g) e ganho diário (g/dia) em relação ao ponto anterior (entrada incluída)
export function evolucaoPeso(lote, bios) {
  const pts = pontosPeso(lote, bios);
  return pts.map((p, i) => {
    const ant = i ? pts[i - 1] : null;
    const dias = ant ? diasEntre(ant.data, p.data) : null;
    return { data: p.data, g: p.g, inicial: !!p.inicial, ganhoDia: ant && dias > 0 ? (p.g - ant.g) / dias : null };
  });
}

// Segunda-feira da semana (YYYY-MM-DD) de uma data ISO
export function inicioSemana(iso) {
  const d = new Date(`${iso}T00:00:00Z`);
  const dia = (d.getUTCDay() + 6) % 7; // segunda = 0
  d.setUTCDate(d.getUTCDate() - dia);
  return d.toISOString().slice(0, 10);
}

// Ração somada por semana, da mais antiga para a mais recente
export function racaoPorSemana(rac) {
  const m = new Map();
  for (const r of rac) m.set(inicioSemana(r.data), (m.get(inicioSemana(r.data)) || 0) + Number(r.quantidade_kg || 0));
  return [...m.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([inicio, kg]) => ({ inicio, kg }));
}

// Matriz dias × tanques: linhas do dia mais recente ao mais antigo (inclui dias sem lançamento)
export function matrizRacao(linhas, tanqueIds, dias, hoje) {
  const celulas = new Map(); // "data|tanque" -> kg
  for (const r of linhas) {
    const k = `${r.data}|${r.tanque_id}`;
    celulas.set(k, (celulas.get(k) || 0) + Number(r.quantidade_kg || 0));
  }
  const datas = [];
  const base = new Date(`${hoje}T00:00:00Z`);
  for (let i = 0; i < dias; i++) {
    const d = new Date(base); d.setUTCDate(d.getUTCDate() - i);
    datas.push(d.toISOString().slice(0, 10));
  }
  const totalTanque = Object.fromEntries(tanqueIds.map((t) => [t, 0]));
  const rows = datas.map((data) => {
    const por = {}; let total = 0;
    for (const t of tanqueIds) {
      const v = celulas.get(`${data}|${t}`);
      por[t] = v == null ? null : v;
      if (v != null) { total += v; totalTanque[t] += v; }
    }
    return { data, por, total };
  });
  return { rows, totalTanque, total: rows.reduce((s, r) => s + r.total, 0) };
}

// Situação do estoque de ração: quantos dias dura no ritmo dos últimos 7 dias.
// nivel: 'sem-dado' | 'ok' | 'atencao' | 'critico' | 'negativo'
// Quanto comprar (kg) para o estoque durar `dias` no ritmo atual (0 se já dá).
export function sugestaoCompraKg(saldoKg, porDiaKg, dias = 30) {
  const porDia = Number(porDiaKg) || 0;
  if (!(porDia > 0)) return 0;
  return Math.max(0, porDia * dias - Math.max(0, Number(saldoKg) || 0));
}

export function situacaoEstoque(saldoKg, consumo7dKg, atencaoDias = 15, criticoDias = 7) {
  const saldo = Number(saldoKg) || 0;
  const porDia = (Number(consumo7dKg) || 0) / 7;
  if (saldo < 0) return { nivel: 'negativo', dias: null, porDia };
  if (!(porDia > 0)) return { nivel: saldo === 0 ? 'critico' : 'sem-dado', dias: null, porDia };
  const dias = saldo / porDia;
  const d = Math.floor(dias);
  const nivel = d <= criticoDias ? 'critico' : d <= atencaoDias ? 'atencao' : 'ok';
  return { nivel, dias, porDia };
}
