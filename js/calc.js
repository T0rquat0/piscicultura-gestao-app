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
  // sem ração lançada até a última biometria não há conversão para calcular (mostrar 0,00 enganava)
  const ca = ganhoBiomassa != null && ganhoBiomassa > 0 && racaoAteBio > 0 ? racaoAteBio / ganhoBiomassa : null;

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
    // custo da ração por kg de peixe produzido (ração até a última biometria ÷ ganho de biomassa)
    custoKgProduzido: precoKg != null && ganhoBiomassa > 0 && racaoAteBio > 0 ? (racaoAteBio * precoKg) / ganhoBiomassa : null,
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

// Data ISO (YYYY-MM-DD) somada de n dias; null se a data ou o n forem inválidos (nunca quebra a tela)
export function somarDias(iso, n) {
  if (!dataValida(iso) || n === null || n === '' || !Number.isFinite(Number(n))) return null;
  const d = new Date(`${iso.slice(0, 10)}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + Number(n));
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

// data YYYY-MM-DD que existe no calendário (2026-02-30 e 2026-13-01 não)
export function dataValida(iso) {
  if (typeof iso !== 'string' || !/^\d{4}-\d{2}-\d{2}/.test(iso)) return false;
  const d = new Date(`${iso.slice(0, 10)}T12:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === iso.slice(0, 10);
}

// Segunda-feira da semana (YYYY-MM-DD) de uma data ISO; null se a data for inválida
export function inicioSemana(iso) {
  if (!dataValida(iso)) return null;
  const d = new Date(`${String(iso).slice(0, 10)}T12:00:00Z`);
  return somarDias(String(iso).slice(0, 10), -((d.getUTCDay() + 6) % 7)); // segunda = 0
}

// Ração somada por semana, da mais antiga para a mais recente
export function racaoPorSemana(rac) {
  const m = new Map();
  for (const r of rac) {
    const sem = inicioSemana(r.data); if (!sem) continue; // lançamento sem data válida fica fora do gráfico por semana
    m.set(sem, (m.get(sem) || 0) + (Number(r.quantidade_kg) || 0));
  }
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
  for (let i = 0; i < dias; i++) { const d = somarDias(hoje, -i); if (d) datas.push(d); }
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

/**
 * Previsão de despesca de um lote pelo ritmo médio de crescimento desde a entrada.
 * lote: {data_entrada, quantidade_inicial, peso_inicial_kg}; r: linha do resumo_lotes
 * (ultimo_peso_medio_kg, ultima_biometria, mortos); alvoKg: peso médio de despesca.
 * Retorna { estado: 'sem-dado' | 'pronto' | 'previsto', pmKg, alvoKg, pct, gpdG, data, dias, biomassaKg }
 */
export function previsaoDespesca(lote, r, alvoKg, hoje) {
  const qi = Number(lote.quantidade_inicial) || 0;
  const pmIni = qi > 0 ? Number(lote.peso_inicial_kg) / qi : null;
  const pm = r && r.ultimo_peso_medio_kg != null ? Number(r.ultimo_peso_medio_kg) : pmIni;
  const vivos = Math.max(0, qi - Number((r && r.mortos) || 0));
  const base = { pmKg: pm, alvoKg, pct: pm != null && alvoKg > 0 ? Math.min(100, (pm / alvoKg) * 100) : null, biomassaKg: alvoKg * vivos };
  if (pm != null && pm >= alvoKg) return { ...base, estado: 'pronto' };
  const dataBio = r && r.ultima_biometria;
  const dias = dataBio ? diasEntre(lote.data_entrada, dataBio) : 0;
  if (pm == null || pmIni == null || !dataBio || !(dias > 0)) return { ...base, estado: 'sem-dado' };
  const gpd = (pm - pmIni) / dias; // kg/dia
  // sem crescimento de verdade (menos de 0,1 g por dia, ou só diferença de arredondamento) não dá para prever:
  // a conta jogaria a data para séculos depois e a data inválida quebrava a tela
  if (!(gpd >= 0.0001)) return { ...base, estado: 'sem-dado' };
  const falta = Math.ceil((alvoKg - pm) / gpd);
  if (!(falta >= 0 && falta <= 3650)) return { ...base, estado: 'sem-dado' };
  const data = somarDias(dataBio, falta);
  if (!data) return { ...base, estado: 'sem-dado' };
  return { ...base, estado: 'previsto', gpdG: gpd * 1000, data, dias: Math.max(0, diasEntre(hoje, data)) };
}

/**
 * Alertas de manejo (funções puras, testáveis em Node).
 * lotes: ativos; resumo: {lote_id: linha do resumo_lotes}; racaoHoje/mediaSemana: {tanque_id: kg};
 * mortes: [{data, lote_id, quantidade}] dos últimos dias; cfg: { biometriaDias, racaoDesvio, morteDiasSeguidos }.
 * Retorna [{ tipo: 'biometria' | 'racao' | 'morte', tanques: [tanque_id], ...detalhes }]
 */
export function alertasManejo({ lotes, resumo, racaoHoje, mediaSemana, mortes, hoje, cfg }) {
  const out = [];
  // 1) biometria vencida: última pesagem (ou a entrada, se nunca pesou) há mais de N dias
  const vencidos = [];
  for (const l of lotes) {
    const r = resumo[l.id];
    const ref = (r && r.ultima_biometria) || l.data_entrada;
    const dias = diasEntre(ref, hoje);
    if (dias > cfg.biometriaDias) vencidos.push({ tanque: l.tanque_id, lote: l.id, dias, nunca: !(r && r.ultima_biometria) });
  }
  if (vencidos.length) out.push({ tipo: 'biometria', itens: vencidos.sort((a, b) => b.dias - a.dias) });
  // 2) ração de hoje fora da média da semana (só tanques que já receberam hoje e têm média)
  const fora = [];
  for (const [tid, kg] of Object.entries(racaoHoje || {})) {
    const m = (mediaSemana || {})[tid];
    if (!(kg > 0) || !(m > 0)) continue;
    const desvio = kg / m - 1;
    if (Math.abs(desvio) >= cfg.racaoDesvio - 1e-9) fora.push({ tanque: tid, kg, media: m, desvio });
  }
  if (fora.length) out.push({ tipo: 'racao', itens: fora.sort((a, b) => Math.abs(b.desvio) - Math.abs(a.desvio)) });
  // 3) mortes no mesmo tanque em N dias seguidos, terminando ontem ou hoje
  const tanqueDoLote = Object.fromEntries(lotes.map((l) => [l.id, l.tanque_id]));
  const diasPorTanque = {};
  for (const m of mortes || []) {
    const t = tanqueDoLote[m.lote_id]; if (!t || !(Number(m.quantidade) > 0)) continue;
    const d = (diasPorTanque[t] ||= {}); d[m.data] = (d[m.data] || 0) + Number(m.quantidade);
  }
  const repetidas = [];
  for (const [t, d] of Object.entries(diasPorTanque)) {
    for (const fim of [0, 1]) { // sequência que termina hoje ou ontem
      let seq = 0, total = 0;
      for (let i = fim; ; i++) {
        const iso = somarDias(hoje, -i);
        if (!iso || !d[iso]) break;
        seq++; total += d[iso];
      }
      if (seq >= cfg.morteDiasSeguidos) { repetidas.push({ tanque: t, dias: seq, total }); break; }
    }
  }
  if (repetidas.length) out.push({ tipo: 'morte', itens: repetidas.sort((a, b) => b.dias - a.dias || b.total - a.total) });
  return out;
}

// Data de fim de um lote encerrado: o último registro (o banco não guarda a data de encerramento)
export function fimDoLote(lote, bios, mort, rac, hoje) {
  if (lote.ativo) return hoje;
  const ds = [...bios, ...mort, ...rac].map((x) => x.data).sort();
  return ds.length ? ds[ds.length - 1] : lote.data_entrada;
}

// O mesmo cálculo do lote, mas só com o que aconteceu até "dias" depois da entrada (comparar ciclos na mesma idade)
export function calcularNaIdade(lote, bios, mort, rac, dias, precoKg = null) {
  const corte = somarDias(lote.data_entrada, dias);
  if (!corte) return null; // sem data de entrada válida não dá para recortar na mesma idade
  const ate = (x) => x.data <= corte;
  return calcularLote(lote, bios.filter(ate), mort.filter(ate), rac.filter(ate), corte, precoKg);
}

// média de um campo numérico, ignorando vazios
export const mediaDe = (lista, k) => { const v = lista.map((x) => x && x[k]).filter((x) => x != null && Number.isFinite(x)); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };

// Sugestão de ração do dia de um tanque: biomassa (vivos × peso médio) × taxa da faixa de peso.
// lotes: os lotes ativos do tanque; resumo: {lote_id: linha}; tabela: TAXA_RACAO. Retorna null sem dados.
export function sugestaoRacao(lotes, resumo, tabela) {
  let kg = 0, bio = 0, provisoria = false, taxas = new Set();
  for (const l of lotes) {
    const r = resumo[l.id];
    const qi = Number(l.quantidade_inicial) || 0;
    const pm = r && r.ultimo_peso_medio_kg != null ? Number(r.ultimo_peso_medio_kg) : qi > 0 ? Number(l.peso_inicial_kg) / qi : null;
    if (!(pm > 0)) continue;
    const vivos = Math.max(0, qi - Number((r && r.mortos) || 0));
    const faixa = tabela.find((f) => pm <= f.ateKg) || tabela[tabela.length - 1];
    const b = vivos * pm;
    bio += b; kg += (b * faixa.pct) / 100; taxas.add(faixa.pct);
    if (faixa.provisoria) provisoria = true;
  }
  if (!(kg > 0)) return null;
  return { kg, biomassaKg: bio, pct: taxas.size === 1 ? [...taxas][0] : (kg / bio) * 100, provisoria };
}
