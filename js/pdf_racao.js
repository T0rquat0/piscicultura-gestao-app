// Relatório de ração por tanque (um dia ou um período), para o responsável enviar ao dono.
// Pode ser da fazenda toda ou de um tanque só (individual).
import { fmtNum, fmtInt, fmtData } from './util.js';
import { COR, M, LARG, TOPO, BASE, ferramentas, rodape, logoPdf, tabela, barras } from './pdf_lote.js';

const n = (v, d = 1) => fmtNum(v, d);
const sac = (kg, kgSaco) => { const v = kg / kgSaco; return n(v, Math.abs(v - Math.round(v)) < 0.05 ? 0 : 1); };
const kgf = (v) => n(v, v % 1 ? 1 : 0);

// d: { fazenda, geradoEm, geradoHora, geradoPor, kgSaco, fontes, logo, titulo, periodo, dias, individual,
//      tanques:[{nome, kg, ativo, lote, vivos, biomassaKg, pesoVivoPct}], linhasDia:[{data, kg, por:{nome:kg|null}}], colunas:[nomes],
//      anterior: { kg, rotulo } }
export function gerarPdfRacao(jsPDF, d) {
  const { fazenda, geradoEm, kgSaco, fontes, titulo, periodo, dias, tanques, linhasDia, colunas, individual } = d;
  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
  const { cor, txt, caps, linha } = ferramentas(doc, fontes);
  doc.setProperties({ title: `Ração fornecida - ${individual ? tanques[0].nome + ' - ' : ''}${periodo}`, author: fazenda, creator: 'Gestão de Piscicultura' });
  let y = 0;
  const cabe = (h) => { if (y + h > BASE) { doc.addPage(); y = TOPO; } };

  logoPdf(doc, d.logo, M, 8.5, 10);
  caps(fazenda, M + 13, 16, { color: COR.rio, size: 7.5 });
  caps(individual ? 'Ração fornecida · tanque' : 'Ração fornecida', 210 - M, 16, { align: 'right' });
  txt(titulo, M, 36, { size: 26, bold: true });
  txt(periodo, M, 44, { size: 12.5, color: COR.mudo });
  y = 53;

  const total = tanques.reduce((s, t) => s + t.kg, 0);
  const alimentados = tanques.filter((t) => t.kg > 0).length;
  const comLote = tanques.filter((t) => t.ativo || t.kg > 0).length;
  const ant = d.anterior || {};
  const variacao = ant.kg > 0 ? ((total - ant.kg) / ant.kg) * 100 : null;
  const varTxt = variacao == null ? '-' : `${variacao > 0 ? '+' : variacao < 0 ? '−' : ''}${n(Math.abs(variacao), 0)}%`;
  const meta = [
    ['Total de ração', `${sac(total, kgSaco)} sacos`],
    ['Em quilos', `${n(total, 0)} kg`],
    individual ? ['Média por dia', `${kgf(total / Math.max(dias, 1))} kg`] : dias > 1 ? ['Média por dia', `${sac(total / dias, kgSaco)} sacos`] : ['Tanques alimentados', `${alimentados} de ${comLote}`],
    [ant.rotulo || 'Comparação', varTxt],
  ];
  cor('fill', COR.fundo); doc.roundedRect(M, y, LARG, 16, 5, 5, 'F');
  meta.forEach(([k, v], i) => {
    const x = M + 6 + ((LARG - 8) / 4) * i;
    caps(k, x, y + 6);
    const cv = i === 3 && variacao != null ? (variacao > 15 ? COR.ambar : COR.tinta) : COR.tinta;
    txt(v, x, y + 11.4, { size: 10.5, color: cv });
  });
  y += 21;
  txt(`Gerado em ${fmtData(geradoEm)}${d.geradoHora ? ' às ' + d.geradoHora : ''}${d.geradoPor ? ' por ' + d.geradoPor : ''}.`, M, y, { size: 7.5, color: COR.mudo });
  y += 6;

  // tanques com lote que ficaram sem ração no período
  const semRacao = tanques.filter((t) => t.ativo && !(t.kg > 0));
  if (semRacao.length) {
    doc.setFontSize(9);
    const texto = doc.splitTextToSize(`Sem ração lançada ${dias > 1 ? 'no período' : 'neste dia'}: ${semRacao.map((t) => t.nome).join(', ')}.`, LARG - 12);
    const h = 6 + texto.length * 4.2;
    cor('fill', [253, 240, 214]); doc.roundedRect(M, y, LARG, h, 3, 3, 'F');
    txt(texto, M + 6, y + 5.6, { size: 9, color: COR.ambar });
    y += h + 5;
  } else { y += 2; }

  let num = 0;
  const secao = (t, need = 30) => {
    cabe(need + 6); num += 1;
    if (num > 1) y += 4;
    linha(M, y, 210 - M, y, 0.25);
    cor('fill', COR.rio); doc.roundedRect(M, y - 0.5, 14, 1.1, 0.55, 0.55, 'F');
    txt(String(num).padStart(2, '0'), M, y + 9, { size: 8.5, bold: true, color: COR.rio });
    txt(t, M + 8, y + 9, { size: 12.5, bold: true });
    y += 17;
  };

  // ---------- por tanque (ou o tanque) ----------
  const temPeso = tanques.some((t) => t.pesoVivoPct != null);
  secao(individual ? 'O tanque' : 'Por tanque', 40);
  if (tanques.length) {
    const head = [['TANQUE', 'LOTE', `SACOS DE ${n(kgSaco, 0)} kg`, 'QUILOS', ...(individual ? [] : ['% DO TOTAL']), ...(temPeso ? ['% DO PESO VIVO'] : [])]];
    const corpo = tanques.map((t) => [
      t.nome, t.lote || '-',
      t.kg > 0 ? sac(t.kg, kgSaco) : (t.ativo ? 'sem lançamento' : '-'),
      t.kg > 0 ? kgf(t.kg) : '-',
      ...(individual ? [] : [total > 0 && t.kg > 0 ? `${n((t.kg / total) * 100, 0)}%` : '-']),
      ...(temPeso ? [t.pesoVivoPct != null && t.kg > 0 ? `${n(t.pesoVivoPct, 1)}%` : '-'] : []),
    ]);
    if (!individual) corpo.push(['Total', '', sac(total, kgSaco), kgf(total), total > 0 ? '100%' : '-', ...(temPeso ? [''] : [])]);
    const al = ['left', 'left', 'right', 'right', ...(individual ? [] : ['right']), ...(temPeso ? ['right'] : [])];
    tabela(doc, y, head, corpo, al);
    y = doc.lastAutoTable.finalY + 4;
    if (temPeso) {
      doc.setFontSize(7.5);
      const nota = doc.splitTextToSize(`% do peso vivo = ração por dia ÷ peso estimado dos peixes do tanque (peixes vivos × peso médio da última biometria). Mostra se a quantidade está dentro do que a fase pede.${individual && tanques[0].biomassaKg ? ` Peso estimado agora: ${n(tanques[0].biomassaKg, 0)} kg (${fmtInt(tanques[0].vivos)} peixes).` : ''}`, LARG);
      txt(nota, M, y + 2, { size: 7.5, color: COR.mudo });
      y += 2 + nota.length * 3.4;
    }
    y += 4;
  } else { txt('Nenhum tanque com lote ativo ou ração no período.', M, y + 1, { size: 9, color: COR.mudo }); y += 10; }

  // ---------- dia a dia ----------
  if (dias > 1) {
    secao('Dia a dia', 90);
    const ord = linhasDia.slice().reverse(); // do mais antigo ao mais recente para o gráfico
    cor('fill', COR.fundo); doc.roundedRect(M, y - 1, LARG, 50, 4, 4, 'F');
    barras(doc, M + 2, y, LARG - 4, 46, ord.map((r) => ({ r: fmtData(r.data).slice(0, 5), v: r.kg })), txt);
    y += 56;
    const usaMatriz = !individual && colunas.length > 0 && colunas.length <= 6;
    const head = [['DIA', ...(usaMatriz ? colunas.map((c) => c.toUpperCase()) : []), 'TOTAL (kg)', 'SACOS']];
    const corpo = linhasDia.map((r) => [fmtData(r.data), ...(usaMatriz ? colunas.map((c) => (r.por[c] == null ? '-' : kgf(r.por[c]))) : []), r.kg > 0 ? kgf(r.kg) : '-', r.kg > 0 ? sac(r.kg, kgSaco) : '-']);
    tabela(doc, y, head, corpo, ['left', ...(usaMatriz ? colunas.map(() => 'right') : []), 'right', 'right']);
    y = doc.lastAutoTable.finalY + 4;
    txt('"-" significa que nada foi lançado naquele dia.', M, y + 2, { size: 7.5, color: COR.mudo });
  }

  rodape(doc, fazenda, titulo, txt, caps, linha, 'Ração fornecida', d.logo);
  return doc;
}
