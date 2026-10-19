// Relatório de ração por tanque (um dia ou uma semana), para o responsável enviar ao dono.
import { fmtNum, fmtInt, fmtData } from './util.js';
import { COR, M, LARG, TOPO, BASE, ferramentas, rodape, tabela, barras } from './pdf_lote.js';

const n = (v, d = 1) => fmtNum(v, d);
const sac = (kg, kgSaco) => { const v = kg / kgSaco; return n(v, Math.abs(v - Math.round(v)) < 0.05 ? 0 : 1); };

// d: { fazenda, geradoEm, kgSaco, fontes, rotulo, periodo, dias, tanques:[{nome, kg, ativo}], linhasDia:[{data, kg, por:{nome:kg|null}}], colunas:[nomes] }
export function gerarPdfRacao(jsPDF, d) {
  const { fazenda, geradoEm, kgSaco, fontes, rotulo, periodo, dias, tanques, linhasDia, colunas } = d;
  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
  const { cor, txt, caps, linha } = ferramentas(doc, fontes);
  doc.setProperties({ title: `Ração fornecida - ${periodo}`, author: fazenda, creator: 'Gestão de Piscicultura' });
  let y = 0;
  const cabe = (h) => { if (y + h > BASE) { doc.addPage(); y = TOPO; } };

  caps(fazenda, M, 16, { color: COR.rio, size: 7.5 });
  caps('Ração fornecida', 210 - M, 16, { align: 'right' });
  txt(rotulo, M, 36, { size: 28, bold: true });
  txt(periodo, M, 44, { size: 12.5, color: COR.mudo });
  y = 53;

  const total = tanques.reduce((s, t) => s + t.kg, 0);
  const alimentados = tanques.filter((t) => t.kg > 0).length;
  const comLote = tanques.filter((t) => t.ativo || t.kg > 0).length;
  const meta = [['Total de ração', `${sac(total, kgSaco)} sacos`], ['Em quilos', `${n(total, 0)} kg`], [dias > 1 ? 'Média por dia' : 'Tanques alimentados', dias > 1 ? `${sac(total / dias, kgSaco)} sacos` : `${alimentados} de ${comLote}`], ['Relatório de', fmtData(geradoEm)]];
  cor('fill', COR.fundo); doc.roundedRect(M, y, LARG, 16, 5, 5, 'F');
  meta.forEach(([k, v], i) => { const x = M + 6 + ((LARG - 8) / 4) * i; caps(k, x, y + 6); txt(v, x, y + 11.4, { size: 10.5 }); });
  y += 28;

  let num = 0;
  const secao = (titulo, need = 30) => {
    cabe(need + 6); num += 1;
    if (num > 1) y += 4;
    linha(M, y, 210 - M, y, 0.25);
    cor('fill', COR.rio); doc.roundedRect(M, y - 0.5, 14, 1.1, 0.55, 0.55, 'F');
    txt(String(num).padStart(2, '0'), M, y + 9, { size: 8.5, bold: true, color: COR.rio });
    txt(titulo, M + 8, y + 9, { size: 12.5, bold: true });
    y += 17;
  };

  // ---------- por tanque ----------
  secao('Por tanque', 40);
  if (tanques.length) {
    const corpo = tanques.map((t) => [t.nome, t.kg > 0 ? sac(t.kg, kgSaco) : (t.ativo ? 'sem lançamento' : '-'), t.kg > 0 ? n(t.kg, t.kg % 1 ? 1 : 0) : '-', total > 0 && t.kg > 0 ? `${n((t.kg / total) * 100, 0)}%` : '-']);
    corpo.push(['Total', sac(total, kgSaco), n(total, total % 1 ? 1 : 0), total > 0 ? '100%' : '-']);
    tabela(doc, y, [['TANQUE', `SACOS DE ${n(kgSaco, 0)} kg`, 'QUILOS', '% DO TOTAL']], corpo, ['left', 'right', 'right', 'right']);
    y = doc.lastAutoTable.finalY + 8;
  } else { txt('Nenhum tanque com lote ativo ou ração no período.', M, y + 1, { size: 9, color: COR.mudo }); y += 10; }

  // ---------- dia a dia ----------
  if (dias > 1) {
    secao('Dia a dia', 90);
    const ord = linhasDia.slice().reverse(); // do mais antigo ao mais recente para o gráfico
    cor('fill', COR.fundo); doc.roundedRect(M, y - 1, LARG, 50, 4, 4, 'F');
    barras(doc, M + 2, y, LARG - 4, 46, ord.map((r) => ({ r: fmtData(r.data).slice(0, 5), v: r.kg })), txt);
    y += 56;
    const usaMatriz = colunas.length > 0 && colunas.length <= 6;
    const head = [['DIA', ...(usaMatriz ? colunas.map((c) => c.toUpperCase()) : []), 'TOTAL (kg)', 'SACOS']];
    const corpo = linhasDia.map((r) => [fmtData(r.data), ...(usaMatriz ? colunas.map((c) => (r.por[c] == null ? '-' : n(r.por[c], r.por[c] % 1 ? 1 : 0))) : []), r.kg > 0 ? n(r.kg, r.kg % 1 ? 1 : 0) : '-', r.kg > 0 ? sac(r.kg, kgSaco) : '-']);
    tabela(doc, y, head, corpo, ['left', ...(usaMatriz ? colunas.map(() => 'right') : []), 'right', 'right']);
    y = doc.lastAutoTable.finalY + 4;
    txt('"-" significa que nada foi lançado naquele dia.', M, y + 2, { size: 7.5, color: COR.mudo });
  }

  rodape(doc, fazenda, rotulo, txt, caps, linha, 'Ração fornecida');
  void fmtInt;
  return doc;
}
