// Relatório do lote em PDF (A4). Desenha com jsPDF (vetorial, texto selecionável).
// Recebe o construtor jsPDF já carregado (no navegador vem de vendor/, nos testes do npm),
// que precisa ter o plugin autoTable aplicado.
// Só usa caracteres da codificação padrão do PDF (sem "≈", "−" etc.).
import { fmtNum, fmtInt, fmtData, fmtBRL, ROTULO_TIPO, diasEntre } from './util.js';
import { pesoMedioKg } from './calc.js';

export const COR = {
  rio: [14, 79, 69], rio2: [10, 61, 53], claro: [225, 238, 232], linha: [208, 220, 213],
  tinta: [24, 36, 31], mudo: [96, 112, 104], branco: [255, 255, 255], zebra: [246, 249, 247],
};
export const M = 14;             // margem lateral (mm)
export const LARG = 210 - 2 * M; // largura útil
const TOPO = 22;                 // início do conteúdo nas páginas seguintes
const BASE = 280;                // limite inferior do conteúdo

const n = (v, d = 1) => fmtNum(v, d);
const dm = (iso) => fmtData(iso).slice(0, 5);

export function gerarPdfLote(jsPDF, d) {
  const { fazenda, lote, nomeTanque, c, bios, mort, evo, semanas, kgSaco, gerir, geradoEm } = d;
  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
  doc.setProperties({ title: `Relatório do lote - ${nomeTanque} - ${lote.especie}`, author: fazenda, creator: 'Gestão de Piscicultura' });
  let y = 0;

  const cor = (t, v) => doc[t === 'fill' ? 'setFillColor' : t === 'draw' ? 'setDrawColor' : 'setTextColor'](...v);
  const txt = (s, x, yy, { size = 10, bold = false, color = COR.tinta, align = 'left', maxW } = {}) => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal'); doc.setFontSize(size); cor('text', color);
    doc.setFont('helvetica', bold ? 'bold' : 'normal'); doc.setFontSize(size);
    doc.text(maxW ? doc.splitTextToSize(String(s), maxW) : (Array.isArray(s) ? s : String(s)), x, yy, { align });
  };
  const nova = () => { doc.addPage(); y = TOPO; };
  const cabe = (h) => { if (y + h > BASE) nova(); };

  // ---------- capa / cabeçalho ----------
  cor('fill', COR.rio); doc.rect(0, 0, 210, 40, 'F');
  txt('RELATÓRIO DO LOTE', M, 14, { size: 9, bold: true, color: [181, 214, 203] });
  txt(`${nomeTanque}  |  ${lote.especie}`, M, 25, { size: 20, bold: true, color: COR.branco, maxW: LARG });
  txt(`${ROTULO_TIPO[lote.tipo] || lote.tipo}  ·  entrada em ${fmtData(lote.data_entrada)}  ·  ${lote.ativo ? 'lote ativo' : 'lote encerrado'}`, M, 33, { size: 10, color: [211, 231, 223] });
  txt(fazenda, 210 - M, 14, { size: 9, bold: true, color: [181, 214, 203], align: 'right' });
  txt(`Gerado em ${fmtData(geradoEm)}`, 210 - M, 33, { size: 9, color: [211, 231, 223], align: 'right' });
  y = 50;

  const secao = (titulo, sub, need = 20) => {
    cabe(need);
    txt(titulo, M, y, { size: 13, bold: true, color: COR.rio });
    y += 2; cor('draw', COR.rio); doc.setLineWidth(0.5); doc.line(M, y, M + 14, y);
    cor('draw', COR.linha); doc.setLineWidth(0.2); doc.line(M + 14, y, 210 - M, y);
    y += 5;
    if (sub) { doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); const ls = doc.splitTextToSize(sub, LARG); txt(ls, M, y, { size: 8.5, color: COR.mudo }); y += ls.length * 4 + 1.5; }
  };
  const paragrafo = (s, o = {}) => {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5);
    const linhas = doc.splitTextToSize(s, LARG);
    cabe(linhas.length * 4.6 + 2);
    txt(linhas, M, y, { size: 9.5, color: o.color || COR.tinta });
    y += linhas.length * 4.6 + 1.8;
  };

  // ---------- 1. resumo (cartões) ----------
  secao('Resumo do lote', 'Os números abaixo usam os lançamentos feitos no aplicativo até a data de geração.');
  const kpi = [
    ['Dias de cultivo', fmtInt(c.diasCultivo), `desde ${fmtData(lote.data_entrada)}`],
    ['Peso médio atual', c.pmAtualG != null ? `${n(c.pmAtualG, 0)} g` : '-', c.dataUltimaBio ? `biometria de ${fmtData(c.dataUltimaBio)}` : 'sem biometria'],
    ['Peixes vivos (estim.)', fmtInt(c.vivos), `de ${fmtInt(lote.quantidade_inicial)} que entraram`],
    ['Sobrevivência', c.sobrevivencia != null ? `${n(c.sobrevivencia, 1)}%` : '-', `${fmtInt(c.mortos)} morto(s)`],
    ['Biomassa estimada', c.biomassaAtual != null ? `${n(c.biomassaAtual, 0)} kg` : '-', `na entrada: ${n(c.biomassaInicial, 0)} kg`],
    ['Ração fornecida', `${n(c.racaoTotal, 0)} kg`, `${n(c.racaoTotal / kgSaco, 1)} sacos de ${n(kgSaco, 0)} kg`],
    ['Conversão alimentar', c.ca != null ? n(c.ca, 2) : '-', c.ca != null ? 'kg de ração por kg ganho' : 'precisa de biometria com ganho'],
    ['Ganho de peso diário', c.gpd != null ? `${n(c.gpd, 1)} g/dia` : '-', 'por peixe, desde a entrada'],
  ];
  if (gerir) {
    const custoKg = c.custoRacao != null && c.ganhoBiomassa > 0 ? c.custoRacao / c.ganhoBiomassa : null;
    kpi.push(['Custo de ração', c.custoRacao != null ? fmtBRL(c.custoRacao) : '-', c.custoRacao != null ? 'preço médio pago por kg' : 'sem valor nas compras']);
    kpi.push(['Custo por kg ganho', custoKg != null ? fmtBRL(custoKg) : '-', 'ração / ganho de biomassa']);
  }
  const cw = (LARG - 3 * 3) / 4, ch = 23;
  kpi.forEach((k, i) => {
    const col = i % 4;
    if (col === 0) cabe(ch + 3);
    const x = M + col * (cw + 3);
    cor('fill', COR.claro); doc.roundedRect(x, y, cw, ch, 2.5, 2.5, 'F');
    txt(k[0], x + 3, y + 5.5, { size: 7.5, color: COR.mudo, maxW: cw - 6 });
    txt(k[1], x + 3, y + 13.5, { size: 14, bold: true, color: COR.rio2, maxW: cw - 6 });
    txt(k[2], x + 3, y + 19.5, { size: 7, color: COR.mudo, maxW: cw - 6 });
    if (col === 3 || i === kpi.length - 1) y += ch + 3;
  });
  y += 3;

  // ---------- 2. leitura em palavras ----------
  secao('O que os números dizem', null, 50);
  const frases = [];
  if (c.pmAtualG != null) {
    frases.push(`Peso: o peso médio passou de ${n(c.pmInicialG, 1)} g na entrada para ${n(c.pmAtualG, 0)} g na última biometria (${fmtData(c.dataUltimaBio)})${c.gpd != null ? `, um ganho de cerca de ${n(c.gpd, 1)} g por peixe por dia` : ''}.`);
  } else {
    frases.push('Peso: ainda não há biometria registrada. Pese uma amostra de peixes para calcular o peso médio, a biomassa e a conversão alimentar.');
  }
  frases.push(`Sobrevivência: dos ${fmtInt(lote.quantidade_inicial)} peixes que entraram, ${fmtInt(c.mortos)} morreram (${n(100 - (c.sobrevivencia ?? 100), 1)}% de mortalidade). Restam cerca de ${fmtInt(c.vivos)} vivos.`);
  frases.push(`Ração: foram fornecidos ${n(c.racaoTotal, 0)} kg (${n(c.racaoTotal / kgSaco, 1)} sacos de ${n(kgSaco, 0)} kg)${c.racaoMediaDia != null ? `, em média ${n(c.racaoMediaDia, 1)} kg por dia (${n(c.racaoMediaDia / kgSaco, 1)} sacos por dia)` : ''}.`);
  if (c.ca != null) frases.push(`Conversão alimentar: ${n(c.ca, 2)}. Foram usados ${n(c.ca, 2)} kg de ração para cada 1 kg de peixe ganho até a última biometria. Quanto menor, melhor; o valor costuma ficar entre 1,2 e 2,0, conforme a espécie e a fase.`);
  if (gerir && c.custoRacao != null) frases.push(`Custo: a ração do lote custou cerca de ${fmtBRL(c.custoRacao)} (preço médio pago por kg, calculado pelas compras com valor informado).`);
  frases.forEach((f) => paragrafo(f));

  const avisos = [];
  if (bios.length < 2) avisos.push('Há menos de duas biometrias: o ganho de peso e a conversão alimentar ficam pouco confiáveis. O ideal é pesar uma amostra a cada 15 dias.');
  if (bios.some((b) => Number(b.quantidade_amostrada) < 30)) avisos.push('Alguma biometria usou menos de 30 peixes. Amostras pequenas dão um peso médio menos preciso; o ideal é pesar de 5% a 10% do lote.');
  if (avisos.length) {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5);
    const h = avisos.reduce((s, a) => s + doc.splitTextToSize(a, LARG - 10).length * 4.2, 0) + 4 + 1.5 * avisos.length;
    cabe(h + 2);
    cor('fill', [253, 240, 214]); doc.roundedRect(M, y, LARG, h, 2, 2, 'F');
    let yy = y + 5.5;
    avisos.forEach((a) => { const ls = doc.splitTextToSize(a, LARG - 10); txt(ls, M + 5, yy, { size: 8.5, color: [110, 70, 6] }); yy += ls.length * 4.2 + 1.5; });
    y += h + 4;
  }

  // ---------- 3. gráfico de peso ----------
  secao('Evolução do peso médio', 'Cada ponto é uma biometria. O primeiro é o peso médio na entrada do lote.', 90);
  const pts = evo.filter((p) => p.g != null);
  if (pts.length >= 2) {
    grafico(doc, M, y, LARG, 62, pts.map((p) => ({ x: p.data, y: p.g })), (v) => (v === 0 ? '0 g' : `${n(v, v < 10 ? 1 : 0)} g`));
    y += 68;
  } else paragrafo('São necessárias pelo menos duas pesagens (a entrada conta como uma) para desenhar o gráfico.', { color: COR.mudo });

  // ---------- 4. tabela de biometrias ----------
  secao('Biometrias', 'Peso médio = peso da amostra dividido pelo número de peixes pesados.', 50);
  if (evo.length) {
    const validas = bios.filter((b) => pesoMedioKg(b) != null);
    let k = 0;
    const linhas = evo.map((p) => {
      const b = p.inicial ? null : validas[k++];
      return [fmtData(p.data), p.inicial ? 'Entrada do lote' : `${fmtInt(b.quantidade_amostrada)} peixes`, n(p.g, 1), p.ganhoDia != null ? n(p.ganhoDia, 1) : '-', n(Math.max(0, diasEntre(lote.data_entrada, p.data)), 0)];
    });
    tabela(doc, y, [['Data', 'Amostra', 'Peso médio (g)', 'Ganho no período (g/dia)', 'Dia do lote']], linhas, ['left', 'left', 'right', 'right', 'right']);
    y = doc.lastAutoTable.finalY + 7;
  } else paragrafo('Nenhuma biometria registrada.', { color: COR.mudo });

  // ---------- 5. ração ----------
  secao('Ração por semana', 'Soma do que foi lançado de segunda a domingo. A semana é identificada pela segunda-feira.', 76);
  if (semanas.length) {
    const ult = semanas.slice(-16);
    barras(doc, M, y, LARG, 52, ult.map((s) => ({ r: dm(s.inicio), v: s.kg })));
    y += 58;
    const linhas = semanas.slice().reverse().map((s) => [`Semana de ${fmtData(s.inicio)}`, n(s.kg, 1), n(s.kg / kgSaco, 1), n(s.kg / 7, 1)]);
    tabela(doc, y, [['Semana', 'Ração (kg)', `Sacos de ${n(kgSaco, 0)} kg`, 'Média por dia (kg)']], linhas, ['left', 'right', 'right', 'right']);
    y = doc.lastAutoTable.finalY + 7;
  } else paragrafo('Nenhuma ração lançada.', { color: COR.mudo });

  // ---------- 6. mortalidade ----------
  secao('Mortalidade', null, 45);
  if (mort.length) {
    let acc = 0;
    const linhas = mort.map((m) => { acc += Number(m.quantidade); return [fmtData(m.data), fmtInt(m.quantidade), fmtInt(acc), `${n((acc / Number(lote.quantidade_inicial)) * 100, 2)}%`]; });
    const lim = linhas.slice(-25);
    tabela(doc, y, [['Data', 'Mortos no dia', 'Total acumulado', '% do lote inicial']], lim, ['left', 'right', 'right', 'right']);
    y = doc.lastAutoTable.finalY + 3;
    if (linhas.length > lim.length) { txt(`Mostrando os ${lim.length} registros mais recentes de ${linhas.length}.`, M, y + 2, { size: 8, color: COR.mudo }); y += 6; }
    y += 4;
  } else paragrafo('Nenhuma mortalidade registrada.', { color: COR.mudo });

  // ---------- 7. como ler ----------
  secao('Como ler este relatório');
  [
    ['Peso médio', 'Peso de uma amostra de peixes dividido pelo número de peixes pesados.'],
    ['Biomassa', 'Peso total estimado dos peixes vivos: peixes vivos x peso médio da última biometria.'],
    ['Sobrevivência', 'Percentual de peixes que continuam vivos em relação ao que entrou. Depende da mortalidade registrada.'],
    ['Conversão alimentar', 'Quantos kg de ração foram usados para cada 1 kg de peixe ganho. Quanto menor, melhor o aproveitamento.'],
    ['Ganho de peso diário', 'Quantos gramas, em média, cada peixe ganha por dia.'],
    ['Valores estimados', 'Peixes vivos, biomassa e conversão são estimativas: dependem de a mortalidade e as biometrias terem sido lançadas. Quanto mais biometrias, mais confiável.'],
  ].forEach(([t, s]) => {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
    const ls = doc.splitTextToSize(s, LARG - 46); cabe(ls.length * 4.2 + 3);
    txt(t, M, y, { size: 9, bold: true, color: COR.rio2 }); txt(ls, M + 44, y, { size: 9 });
    y += ls.length * 4.2 + 2.2;
  });

  rodape(doc, fazenda, `${nomeTanque} | ${lote.especie}`);
  return doc;
}

// cabeçalho corrente (páginas 2+) e rodapé em todas as páginas
export function rodape(doc, fazenda, titulo) {
  const total = doc.getNumberOfPages();
  for (let p = 1; p <= total; p++) {
    doc.setPage(p);
    if (p > 1) {
      doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); doc.setTextColor(...COR.rio); doc.text(titulo, M, 12);
      doc.setFont('helvetica', 'normal'); doc.setTextColor(...COR.mudo); doc.text(fazenda, 210 - M, 12, { align: 'right' });
      doc.setDrawColor(...COR.linha); doc.setLineWidth(0.2); doc.line(M, 15, 210 - M, 15);
    }
    doc.setDrawColor(...COR.linha); doc.setLineWidth(0.2); doc.line(M, 287, 210 - M, 287);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...COR.mudo);
    doc.text('Gestão de Piscicultura', M, 292);
    doc.text(`Página ${p} de ${total}`, 210 - M, 292, { align: 'right' });
  }
}

export function tabela(doc, y, head, body, align) {
  const colStyles = {}; align.forEach((a, i) => { colStyles[i] = { halign: a }; });
  doc.autoTable({
    startY: y, head, body, margin: { left: M, right: M, top: TOPO, bottom: 14 }, theme: 'plain',
    styles: { font: 'helvetica', fontSize: 8.5, cellPadding: { top: 1.8, bottom: 1.8, left: 2.5, right: 2.5 }, textColor: COR.tinta },
    headStyles: { fillColor: COR.rio, textColor: COR.branco, fontStyle: 'bold', fontSize: 8 },
    alternateRowStyles: { fillColor: COR.zebra },
    columnStyles: colStyles,
    didParseCell: (h) => { if (h.section === 'head') h.cell.styles.halign = align[h.column.index]; },
  });
}

// escala "bonita" para o eixo Y
function escala(max) {
  const bruto = (max || 1) / 4; const mag = 10 ** Math.floor(Math.log10(bruto));
  const passo = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((p) => p >= bruto) || mag;
  return { passo, topo: Math.max(passo, Math.ceil(max / passo) * passo) };
}

export function grafico(doc, x0, y0, w, h, pontos, fmtY) {
  const pl = 16, pr = 6, pt = 8, pb = 9;
  const X = x0 + pl, Y = y0 + pt, W = w - pl - pr, H = h - pt - pb;
  const t = (iso) => new Date(`${iso}T00:00:00Z`).getTime();
  const t0 = t(pontos[0].x), t1 = t(pontos[pontos.length - 1].x);
  const { passo, topo } = escala(Math.max(...pontos.map((p) => p.y)));
  const px = (iso) => X + (t1 === t0 ? 0 : ((t(iso) - t0) / (t1 - t0)) * W);
  const py = (v) => Y + H - (v / topo) * H;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5);
  for (let v = 0; v <= topo + 1e-9; v += passo) {
    doc.setDrawColor(...COR.linha); doc.setLineWidth(0.15); doc.line(X, py(v), X + W, py(v));
    doc.setTextColor(...COR.mudo); doc.text(fmtY(v), X - 2, py(v) + 1, { align: 'right' });
  }
  doc.setDrawColor(...COR.rio); doc.setLineWidth(0.8);
  for (let i = 1; i < pontos.length; i++) doc.line(px(pontos[i - 1].x), py(pontos[i - 1].y), px(pontos[i].x), py(pontos[i].y));
  pontos.forEach((p) => { doc.setFillColor(...COR.branco); doc.setDrawColor(...COR.rio); doc.setLineWidth(0.6); doc.circle(px(p.x), py(p.y), 1.2, 'FD'); });
  const rot = pontos.length <= 8 ? pontos : [pontos[0], pontos[Math.floor(pontos.length / 2)], pontos[pontos.length - 1]];
  rot.forEach((p, i) => {
    doc.setTextColor(...COR.tinta); doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5);
    doc.text(fmtY(p.y), px(p.x), py(p.y) - 2.6, { align: i === 0 ? 'left' : i === rot.length - 1 ? 'right' : 'center' });
  });
  doc.setFont('helvetica', 'normal'); doc.setTextColor(...COR.mudo);
  const datas = pontos.length <= 6 ? pontos : rot;
  datas.forEach((p, i) => doc.text(fmtData(p.x), px(p.x), Y + H + 5, { align: i === 0 ? 'left' : i === datas.length - 1 ? 'right' : 'center' }));
}

export function barras(doc, x0, y0, w, h, itens) {
  const pl = 14, pr = 2, pt = 6, pb = 8;
  const X = x0 + pl, Y = y0 + pt, W = w - pl - pr, H = h - pt - pb;
  const { passo, topo } = escala(Math.max(...itens.map((i) => i.v)));
  doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5);
  for (let v = 0; v <= topo + 1e-9; v += passo) {
    const yy = Y + H - (v / topo) * H;
    doc.setDrawColor(...COR.linha); doc.setLineWidth(0.15); doc.line(X, yy, X + W, yy);
    doc.setTextColor(...COR.mudo); doc.text(fmtNum(v, 0), X - 2, yy + 1, { align: 'right' });
  }
  const slot = W / itens.length, bw = Math.min(slot * 0.62, 12);
  itens.forEach((it, i) => {
    const bh = (it.v / topo) * H, bx = X + i * slot + (slot - bw) / 2;
    doc.setFillColor(...COR.rio); doc.roundedRect(bx, Y + H - bh, bw, Math.max(bh, 0.4), 0.8, 0.8, 'F');
    if (itens.length <= 12) { doc.setTextColor(...COR.tinta); doc.setFontSize(7); doc.text(fmtNum(it.v, 0), bx + bw / 2, Y + H - bh - 1.5, { align: 'center' }); }
    doc.setTextColor(...COR.mudo); doc.setFontSize(6.8);
    if (itens.length <= 10 || i % 2 === 0) doc.text(it.r, bx + bw / 2, Y + H + 4.5, { align: 'center' });
  });
}
