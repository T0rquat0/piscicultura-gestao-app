// Relatório de ração (um dia ou um período), em formato de PAINEL: total em destaque, gráfico de barras
// deitadas por tanque (do que mais comeu para o que menos comeu) e a tabela com o detalhe embaixo.
// Pode ser da fazenda toda ou de um tanque só (individual: o gráfico vira o dia a dia do tanque).
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
  const { cor, txt, caps, linha, largura } = ferramentas(doc, fontes);
  doc.setProperties({ title: `Ração fornecida - ${individual ? tanques[0].nome + ' - ' : ''}${periodo}`, author: fazenda, creator: 'Gestão de Piscicultura' });
  let y = 0;
  const cabe = (h) => { if (y + h > BASE) { doc.addPage(); y = TOPO; } };
  const DIR = 210 - M;

  const total = tanques.reduce((s, t) => s + t.kg, 0);
  const alimentados = tanques.filter((t) => t.kg > 0).length;
  const comLote = tanques.filter((t) => t.ativo || t.kg > 0).length;
  const ant = d.anterior || {};
  const variacao = ant.kg > 0 ? ((total - ant.kg) / ant.kg) * 100 : null;
  const varTxt = variacao == null ? '' : `${variacao > 0 ? '+' : variacao < 0 ? '−' : ''}${n(Math.abs(variacao), 0)}% ${String(ant.rotulo || '').toLowerCase()}`;

  // ---------- cabeçalho: título à esquerda, total grande à direita ----------
  logoPdf(doc, d.logo, M, 8.5, 10);
  caps(fazenda, M + 13, 16, { color: COR.rio, size: 7.5 });
  caps(individual ? 'Ração fornecida · tanque' : 'Ração fornecida', DIR, 16, { align: 'right' });
  txt(titulo, M, 37, { size: 24, bold: true });
  txt(periodo, M, 45, { size: 11.5, color: COR.mudo });
  txt(`${sac(total, kgSaco)} sacos`, DIR, 37, { size: 24, bold: true, color: COR.rio, align: 'right' });
  txt(`${n(total, 0)} kg${varTxt ? ' · ' : ''}`, DIR - (varTxt ? largura(varTxt, 11.5, false) : 0), 45, { size: 11.5, color: COR.mudo, align: 'right' });
  if (varTxt) txt(varTxt, DIR, 45, { size: 11.5, color: variacao > 15 ? COR.ambar : COR.mudo, align: 'right' });
  y = 53;

  // ---------- faixa de números ----------
  const maior = tanques.filter((t) => t.kg > 0).sort((a, b) => b.kg - a.kg)[0];
  const meta = individual
    ? [['Média por dia', `${kgf(total / Math.max(dias, 1))} kg`], ['Peixes (estim.)', tanques[0].vivos ? fmtInt(tanques[0].vivos) : '-'],
       ['Peso estimado', tanques[0].biomassaKg ? `${n(tanques[0].biomassaKg, 0)} kg` : '-'], ['% do peso vivo', tanques[0].pesoVivoPct != null && total > 0 ? `${n(tanques[0].pesoVivoPct, 1)}% ao dia` : '-']]
    : [['Tanques alimentados', `${alimentados} de ${comLote}`], [dias > 1 ? 'Média por dia' : 'Média por tanque', dias > 1 ? `${sac(total / dias, kgSaco)} sacos` : `${sac(alimentados ? total / alimentados : 0, kgSaco)} sacos`],
       ['Maior consumo', maior ? maior.nome : '-'], ['Lotes ativos', String(tanques.filter((t) => t.ativo).length)]];
  cor('fill', COR.fundo); doc.roundedRect(M, y, LARG, 15, 4, 4, 'F');
  meta.forEach(([k, v], i) => {
    const x = M + 6 + ((LARG - 8) / 4) * i;
    caps(k, x, y + 5.8);
    const vv = doc.splitTextToSize(String(v), (LARG - 8) / 4 - 4)[0];
    txt(vv, x, y + 11, { size: 10 });
  });
  y += 20;

  // tanques com lote que ficaram sem ração
  const semRacao = tanques.filter((t) => t.ativo && !(t.kg > 0));
  if (semRacao.length) {
    doc.setFontSize(9);
    const texto = doc.splitTextToSize(`Sem ração lançada ${dias > 1 ? 'no período' : 'neste dia'}: ${semRacao.map((t) => t.nome).join(', ')}.`, LARG - 12);
    const h = 6 + texto.length * 4.2;
    cor('fill', [253, 240, 214]); doc.roundedRect(M, y, LARG, h, 3, 3, 'F');
    txt(texto, M + 6, y + 5.6, { size: 9, color: COR.ambar });
    y += h + 5;
  }

  const titulo2 = (t, sub) => {
    cabe(24);
    txt(t, M, y + 5, { size: 12, bold: true });
    if (sub) txt(sub, DIR, y + 5, { size: 8, color: COR.mudo, align: 'right' });
    y += 10;
  };

  // ---------- gráfico ----------
  if (!individual && tanques.length) {
    // barras deitadas, do maior para o menor
    titulo2('Ração por tanque', `em sacos de ${n(kgSaco, 0)} kg`);
    const ord = tanques.slice().sort((a, b) => b.kg - a.kg || String(a.nome).localeCompare(String(b.nome), 'pt-BR', { numeric: true }));
    const maxKg = Math.max(...ord.map((t) => t.kg), 1);
    const colNome = 52, colValor = 34, xBar = M + colNome, wBar = LARG - colNome - colValor, alt = 7.5;
    cabe(ord.length * (alt + 2.2) + 8);
    ord.forEach((t) => {
      const nome = doc.splitTextToSize(t.nome, colNome - 4)[0];
      txt(nome, M, y + alt / 2 + 1.3, { size: 9.5 });
      cor('fill', COR.fundo); doc.roundedRect(xBar, y, wBar, alt, 2, 2, 'F');
      if (t.kg > 0) {
        const w = Math.max(3, (t.kg / maxKg) * wBar);
        cor('fill', t === ord[0] ? COR.rio : [75, 140, 120]); doc.roundedRect(xBar, y, w, alt, 2, 2, 'F');
        txt(`${n((t.kg / Math.max(total, 1)) * 100, 0)}%`, xBar + w + 2, y + alt / 2 + 1.2, { size: 7.5, color: COR.mudo });
        txt(`${sac(t.kg, kgSaco)}`, DIR - 12, y + alt / 2 + 1.4, { size: 10.5, bold: true, align: 'right' });
        txt(`${kgf(t.kg)} kg`, DIR, y + alt / 2 + 1.3, { size: 7.5, color: COR.mudo, align: 'right' });
      } else {
        txt(t.ativo ? 'sem lançamento' : '-', xBar + 3, y + alt / 2 + 1.2, { size: 8, color: COR.ambar });
      }
      y += alt + 2.2;
    });
    y += 6;
  } else if (individual && dias > 1) {
    titulo2('Dia a dia', 'em kg');
    const ord = linhasDia.slice().reverse();
    cabe(56);
    cor('fill', COR.fundo); doc.roundedRect(M, y - 1, LARG, 50, 4, 4, 'F');
    barras(doc, M + 2, y, LARG - 4, 46, ord.map((r) => ({ r: fmtData(r.data).slice(0, 5), v: r.kg })), txt);
    y += 56;
  }

  // ---------- tabela com o detalhe ----------
  const temPeso = tanques.some((t) => t.pesoVivoPct != null);
  titulo2('Detalhe', individual ? '' : 'na ordem dos tanques');
  if (tanques.length) {
    const head = [['TANQUE', 'LOTE', `SACOS`, 'QUILOS', ...(individual ? [] : ['% DO TOTAL']), ...(temPeso ? ['% DO PESO VIVO'] : [])]];
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
      const nota = doc.splitTextToSize('% do peso vivo = ração por dia ÷ peso estimado dos peixes do tanque (peixes vivos × peso médio da última biometria). Mostra se a quantidade está dentro do que a fase pede.', LARG);
      txt(nota, M, y + 2, { size: 7.5, color: COR.mudo });
      y += 2 + nota.length * 3.4;
    }
    y += 4;
  } else { txt('Nenhum tanque com lote ativo ou ração no período.', M, y + 1, { size: 9, color: COR.mudo }); y += 10; }

  // ---------- dia a dia (fazenda toda, período) ----------
  if (!individual && dias > 1) {
    titulo2('Dia a dia', 'em kg');
    cabe(56);
    const ord = linhasDia.slice().reverse();
    cor('fill', COR.fundo); doc.roundedRect(M, y - 1, LARG, 50, 4, 4, 'F');
    barras(doc, M + 2, y, LARG - 4, 46, ord.map((r) => ({ r: fmtData(r.data).slice(0, 5), v: r.kg })), txt);
    y += 56;
  }
  if (dias > 1) {
    const usaMatriz = !individual && colunas.length > 0 && colunas.length <= 6;
    const head = [['DIA', ...(usaMatriz ? colunas.map((c) => c.toUpperCase()) : []), 'TOTAL (kg)', 'SACOS']];
    const corpo = linhasDia.map((r) => [fmtData(r.data), ...(usaMatriz ? colunas.map((c) => (r.por[c] == null ? '-' : kgf(r.por[c]))) : []), r.kg > 0 ? kgf(r.kg) : '-', r.kg > 0 ? sac(r.kg, kgSaco) : '-']);
    cabe(30);
    tabela(doc, y, head, corpo, ['left', ...(usaMatriz ? colunas.map(() => 'right') : []), 'right', 'right']);
    y = doc.lastAutoTable.finalY + 4;
    txt('"-" significa que nada foi lançado naquele dia.', M, y + 2, { size: 7.5, color: COR.mudo });
    y += 6;
  }

  cabe(10);
  linha(M, y + 2, DIR, y + 2, 0.2);
  txt(`Gerado em ${fmtData(geradoEm)}${d.geradoHora ? ' às ' + d.geradoHora : ''}${d.geradoPor ? ' por ' + d.geradoPor : ''}.`, M, y + 7, { size: 7.5, color: COR.mudo });
  rodape(doc, fazenda, titulo, txt, caps, linha, 'Ração fornecida', d.logo);
  return doc;
}
