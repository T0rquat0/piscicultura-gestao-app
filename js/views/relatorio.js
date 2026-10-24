// Relatórios por lote (precisam de internet: usam os dados já sincronizados no servidor).
import { PESO_SACO_PADRAO_KG, ESTOQUE_ATENCAO_DIAS, ESTOQUE_CRITICO_DIAS, CAUSAS_MORTE } from '../config.js';
import { carregarGerador, carregarFontes, abrirVisualizador } from '../pdf_ui.js';
import { gerarPdfLote } from '../pdf_lote.js';
import { gerarPdfFazenda } from '../pdf_fazenda.js';
import { gerarPdfRacao } from '../pdf_racao.js';
import { confirmar, formulario } from '../dialogo.js';
import { icone } from '../icons.js';
import { esc, fmtData, fmtNum, fmtInt, fmtBRL, hojeISO, num, ROTULO_TIPO, faseCss, nomeArquivo, dataArquivo, progresso, fmtPct } from '../util.js';
import { pizza, COR_FASE, ORDEM_FASE } from '../graficos.js';
import { calcularNaIdade, fimDoLote, mediaDe } from '../calc.js';
import { calcularLote, precoMedioKg, pontosPeso, pesoMedioKg, evolucaoPeso, racaoPorSemana, matrizRacao, situacaoEstoque } from '../calc.js';

export function svgPeso(pts) {
  if (pts.length < 2) return '<p class="mudo">O gráfico aparece a partir da primeira biometria.</p>';
  const W = 320, H = 150, pl = 36, pr = 10, pt = 10, pb = 22;
  const t = (d) => Date.parse(`${d}T00:00:00Z`);
  const t0 = t(pts[0].data), t1 = t(pts[pts.length - 1].data);
  const span = t1 > t0 ? t1 - t0 : 1;
  const ys = pts.map((p) => p.g);
  let ymin = Math.min(...ys) * 0.9, ymax = Math.max(...ys) * 1.05;
  if (ymax <= ymin) ymax = ymin + 1;
  const X = (d) => pl + ((t(d) - t0) / span) * (W - pl - pr);
  const Y = (g) => pt + (1 - (g - ymin) / (ymax - ymin)) * (H - pt - pb);
  const linha = pts.map((p, i) => `${i ? 'L' : 'M'}${X(p.data).toFixed(1)},${Y(p.g).toFixed(1)}`).join(' ');
  return `<svg class="grafico" viewBox="0 0 ${W} ${H}" role="img" aria-label="Evolução do peso médio">
    <line class="eixo" x1="${pl}" y1="${pt}" x2="${pl}" y2="${H - pb}"/><line class="eixo" x1="${pl}" y1="${H - pb}" x2="${W - pr}" y2="${H - pb}"/>
    <text x="${pl - 4}" y="${pt + 8}" text-anchor="end">${fmtNum(ymax, 0)} g</text>
    <text x="${pl - 4}" y="${H - pb}" text-anchor="end">${fmtNum(ymin, 0)} g</text>
    <text x="${pl}" y="${H - 6}">${fmtData(pts[0].data)}</text>
    <text x="${W - pr}" y="${H - 6}" text-anchor="end">${fmtData(pts[pts.length - 1].data)}</text>
    <path class="linha" d="${linha}"/>
    ${pts.map((p) => `<circle class="pt${p.inicial ? ' ini' : ''}" cx="${X(p.data).toFixed(1)}" cy="${Y(p.g).toFixed(1)}" r="4"/>`).join('')}
  </svg>`;
}

const csvNum = (n, d = 2) => (n == null ? '' : Number(n).toFixed(d).replace('.', ','));
export function montarCsv(lote, nomeTanque, calc, bios, mort, rac, quem) {
  const L = [];
  L.push(['Relatório do lote'], ['Tanque', nomeTanque], ['Fase', ROTULO_TIPO[lote.tipo] || lote.tipo], ['Espécie', lote.especie],
    ['Entrada', fmtData(lote.data_entrada)], ['Peixes iniciais', lote.quantidade_inicial], ['Peso total inicial (kg)', csvNum(lote.peso_inicial_kg)],
    [], ['RESUMO'], ['Dias de cultivo', calc.diasCultivo], ['Peixes vivos (estimado)', calc.vivos], ['Mortos', calc.mortos],
    ['Ração total (kg)', csvNum(calc.racaoTotal)], ['Peso médio atual (g)', csvNum(calc.pmAtualG, 1)],
    ['Conversão alimentar aparente', csvNum(calc.ca)], ['Custo de ração por kg produzido (R$)', csvNum(calc.custoKgProduzido)], ['Ganho de peso diário (g/dia)', csvNum(calc.gpd)], [],
    ['RAÇÃO'], ['Data', 'Quantidade (kg)', 'Registrado por']);
  rac.forEach((r) => L.push([fmtData(r.data), csvNum(r.quantidade_kg), quem(r.registrado_por)]));
  L.push([], ['BIOMETRIAS'], ['Data', 'Peso da amostra (kg)', 'Peixes na amostra', 'Peso médio (g)', 'Registrado por']);
  bios.forEach((b) => L.push([fmtData(b.data), csvNum(b.peso_amostra_kg, 3), b.quantidade_amostrada, csvNum(pesoMedioKg(b) * 1000, 1), quem(b.registrado_por)]));
  L.push([], ['MORTALIDADE'], ['Data', 'Quantidade', 'Registrado por', 'Causa provável']);
  mort.forEach((m) => L.push([fmtData(m.data), m.quantidade, quem(m.registrado_por), m.causa || '']));
  return '﻿' + L.map((l) => l.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(';')).join('\r\n');
}

export async function renderRelatorios(ctx, el) {
  el.innerHTML = '<h1>Relatórios</h1><p class="carregando">Carregando…</p>';
  if (!navigator.onLine) {
    el.innerHTML = '<h1>Relatórios</h1><div class="card vazio"><p>Os relatórios precisam de internet, porque usam os dados já enviados ao servidor.</p></div>';
    return;
  }
  const [lotes, resumoRows] = await Promise.all([ctx.api.lotes(), ctx.api.resumoLotes().catch(() => [])]);
  const resumo = Object.fromEntries((resumoRows || []).map((x) => [x.lote_id, x]));
  const tanques = ctx.state.ref.tanques;
  const nat = (x, y) => String(x).localeCompare(String(y), 'pt-BR', { numeric: true, sensitivity: 'base' });
  const nomeDe = (tid) => (tanques.find((t) => t.id === tid) || {}).nome || '';
  const porTanque = (l1, l2) => nat(nomeDe(l1.tanque_id), nomeDe(l2.tanque_id)) || String(l2.data_entrada).localeCompare(String(l1.data_entrada));
  const linhaLote = (l) => `<li><a class="item" href="#/relatorio/${esc(l.id)}"><span class="esq"><b>${esc(nomeDe(l.tanque_id))}</b>
      <small>${esc(ROTULO_TIPO[l.tipo] || l.tipo)} · ${esc(l.especie)} · desde ${fmtData(l.data_entrada)} · ${fmtInt(l.quantidade_inicial)} peixes</small>${sobreLote(l)}</span><span class="seta">${icone('direita', 20)}</span></a></li>`;
  function sobreLote(l) {
    const x = resumo[l.id], ini = Number(l.quantidade_inicial) || 0;
    if (!x || !ini || !l.ativo) return '';
    const pct = (Math.max(0, ini - Number(x.mortos || 0)) / ini) * 100;
    return `${progresso(pct, { fina: true, tom: pct >= 90 ? 'ok' : pct >= 75 ? 'alerta' : 'erro', rotulo: `Sobrevivência ${fmtPct(pct)}%` })}<small class="prog-leg">Sobrevivência ${fmtPct(pct)}%</small>`;
  }
  const ativos = lotes.filter((l) => l.ativo).sort(porTanque);
  const encerrados = lotes.filter((l) => !l.ativo).sort(porTanque);
  el.innerHTML = `<h1>Relatórios</h1>
    <p class="mudo" style="margin-top:-.4rem">O que você quer saber?</p>
    <div class="hub">
      <a class="hub-card" href="#/relatorio/racao"><span class="item-ic">${icone('lancar')}</span><span class="esq"><b>Ração fornecida</b><small>Quanta ração cada tanque recebeu, hoje ou na semana. Dá para enviar ao dono.</small></span><span class="seta">${icone('direita', 20)}</span></a>
      <a class="hub-card" href="#/estoque"><span class="item-ic">${icone('estoque')}</span><span class="esq"><b>Estoque de ração</b><small>Quanto resta no galpão e para quantos dias dá.</small></span><span class="seta">${icone('direita', 20)}</span></a>
      <button class="hub-card" id="b-pdf-fazenda" type="button"><span class="item-ic">${icone('relatorio')}</span><span class="esq"><b>Relatório geral da fazenda</b><small>PDF com estoque, lotes e mortalidade, para compartilhar.</small></span><span class="seta">${icone('direita', 20)}</span></button>
    </div>
    <h2>Relatório de um lote</h2>
    <p class="mudo" style="margin-top:-.4rem">Peso, mortalidade e ração de cada lote de peixes.</p>
    ${ativos.length ? `<div class="card"><ul class="lista lista-grade">${ativos.map(linhaLote).join('')}</ul></div>` : '<div class="card vazio"><p>Ainda não há lotes ativos.</p></div>'}
    ${encerrados.length ? `<details class="avancado"><summary>Lotes encerrados (${encerrados.length})</summary><div class="card"><ul class="lista">${encerrados.map(linhaLote).join('')}</ul></div></details>` : ''}`;

  const bf = el.querySelector('#b-pdf-fazenda');
  bf.addEventListener('click', async () => {
    const texto = bf.innerHTML; bf.disabled = true; bf.innerHTML = '<span class="item-ic">…</span><span class="esq"><b>Gerando o PDF…</b></span>';
    try {
      const gerir = ctx.podeGerir();
      const hoje = hojeISO();
      const kgS = ctx.state.ref.kgSaco || PESO_SACO_PADRAO_KG;
      const d30 = new Date(`${hoje}T00:00:00Z`); d30.setUTCDate(d30.getUTCDate() - 29);
      const desde = d30.toISOString().slice(0, 10);
      const [[jsPDF, fontes], saldo, linhas, compras, contagens] = await Promise.all([
        Promise.all([carregarGerador(), carregarFontes()]),
        ctx.api.saldoRacao(), ctx.api.racaoPeriodo(desde),
        gerir ? ctx.api.compras(true).catch(() => []) : Promise.resolve([]),
        gerir ? ctx.api.contagens().catch(() => []) : Promise.resolve([]),
      ]);
      const precoKg = gerir ? precoMedioKg(compras) : null;
      const nomeDe = (tid) => (tanques.find((t) => t.id === tid) || {}).nome || '';
      const ativos = lotes.filter((l) => l.ativo);
      const detalhes = await Promise.all(ativos.map(async (l) => {
        const { bios, mort, rac } = await ctx.api.dadosLote(l.id);
        return { nomeTanque: nomeDe(l.tanque_id), lote: l, c: calcularLote(l, bios, mort, rac, hoje, precoKg) };
      }));
      detalhes.sort((a, b) => String(a.nomeTanque).localeCompare(String(b.nomeTanque), 'pt-BR', { numeric: true, sensitivity: 'base' }));
      const porDia = new Map(); const porTanque = new Map();
      for (const r of linhas) { porDia.set(r.data, (porDia.get(r.data) || 0) + Number(r.quantidade_kg)); porTanque.set(r.tanque_id, (porTanque.get(r.tanque_id) || 0) + Number(r.quantidade_kg)); }
      const racaoDia = [];
      for (let i = 0; i < 30; i++) { const dd = new Date(d30); dd.setUTCDate(dd.getUTCDate() + i); const iso = dd.toISOString().slice(0, 10); racaoDia.push({ data: iso, kg: porDia.get(iso) || 0 }); }
      const racaoTanque = tanques.filter((t) => porTanque.has(t.id)).map((t) => ({ nome: t.nome, kg: porTanque.get(t.id) }))
        .sort((a, b) => String(a.nome).localeCompare(String(b.nome), 'pt-BR', { numeric: true, sensitivity: 'base' }));
      const doc = gerarPdfFazenda(jsPDF, {
        logo: ctx.state.ref.logo || null, fazenda: (ctx.state.perfil.fazendas && ctx.state.perfil.fazendas.nome) || 'Piscicultura', geradoEm: hoje, kgSaco: kgS, gerir, fontes, saldo: saldo || {},
        sit: situacaoEstoque(saldo && saldo.saldo_kg, saldo && saldo.consumo_7d_kg, ESTOQUE_ATENCAO_DIAS, ESTOQUE_CRITICO_DIAS),
        lotes: detalhes, racaoDia, racaoTanque, precoKg, ultimaContagem: contagens[0] || null,
      });
      bf.disabled = false; bf.innerHTML = texto;
      await abrirVisualizador({ blob: doc.output('blob'), nome: nomeArquivo(['Relatório geral', (ctx.state.perfil.fazendas && ctx.state.perfil.fazendas.nome) || 'Piscicultura', dataArquivo(hoje)], 'pdf'), titulo: 'Relatório geral da fazenda', toast: ctx.toast });
    } catch (e) { ctx.toast(e.message || 'Não foi possível gerar o PDF', 'erro'); bf.disabled = false; bf.innerHTML = texto; }
  });
}

export async function renderRelatorioLote(ctx, el, id) {
  el.innerHTML = '<p class="carregando">Montando relatório…</p>';
  if (!navigator.onLine) {
    el.innerHTML = `<p><a class="voltar" href="#/relatorio">${icone('voltar', 18)} Relatórios</a></p><div class="card vazio"><p>O relatório precisa de internet.</p></div>`;
    return;
  }
  const gerir = ctx.podeGerir();
  const lote = await ctx.api.lote(id);
  if (!lote) { el.innerHTML = '<div class="card vazio">Lote não encontrado.<br><a class="btn" href="#/relatorio">Voltar</a></div>'; return; }
  const [{ bios, mort, rac }, nomes, compras] = await Promise.all([
    ctx.api.dadosLote(id),
    ctx.api.nomesUsuarios().catch(() => ({})),
    gerir ? ctx.api.compras(true).catch(() => []) : Promise.resolve([]),
  ]);
  const kgS = ctx.state.ref.kgSaco || PESO_SACO_PADRAO_KG;
  const quem = (uid) => nomes[uid] || (uid === ctx.state.perfil.id ? 'Você' : 'Colega');
  const hoje = hojeISO();
  const datas = [...bios, ...mort, ...rac].map((x) => x.data).sort();
  const fim = lote.ativo ? hoje : (datas.length ? datas[datas.length - 1] : hoje);
  const c = calcularLote(lote, bios, mort, rac, fim, gerir ? precoMedioKg(compras) : null);
  const nomeTanque = lote.tanques ? lote.tanques.nome : ((ctx.state.ref.tanques.find((t) => t.id === lote.tanque_id) || {}).nome || '');

  const unid = (v, u) => `${v}<em>${u}</em>`;
  const destaque = (rotulo, valor, sub) => `<div class="destaque"><span>${rotulo}</span><b>${valor}</b>${sub ? `<small>${sub}</small>` : ''}</div>`;
  const linhaNum = (rotulo, valor, sub) => `<li><div class="esq"><b>${rotulo}</b>${sub ? `<small>${sub}</small>` : ''}</div><span class="valor">${valor}</span></li>`;
  const excluir = (tab, rid) => (gerir ? `<span class="acoes-reg no-print"><button class="btn mini no-print" data-edit="${tab}:${esc(rid)}" type="button">Editar</button><button class="btn mini perigo no-print" data-del="${tab}:${esc(rid)}" type="button">Excluir</button></span>` : '');
  const registro = (data, quemId, valor, tab, rid) => `<li><div class="esq"><b>${fmtData(data)}</b><small>${esc(quem(quemId))}</small></div><span class="valor">${valor}</span>${excluir(tab, rid)}</li>`;
  const secao = (titulo, itens, vazio) => `
    <section class="bloco"><h2>${titulo} <span class="contagem">${itens.length}</span></h2>
      <div class="card">${itens.length ? `<ul class="lista registros">${itens.join('')}</ul>` : `<p class="mudo" style="margin:0">${vazio}</p>`}</div></section>`;

  // ---- comparação com ciclos encerrados: na mesma idade deste lote e como terminaram ----
  let cmpHtml = '', cmpPdf = null;
  async function compararCiclos() {
    const precoKg = gerir ? precoMedioKg(compras) : null;
    const todos = await ctx.api.lotes().catch(() => []);
    const enc = todos.filter((l) => !l.ativo && l.id !== lote.id && l.especie === lote.especie);
    const recentes = (a, b) => String(b.data_entrada).localeCompare(String(a.data_entrada));
    const anteriorTanque = enc.filter((l) => l.tanque_id === lote.tanque_id).sort(recentes)[0] || null;
    const mesmaFase = enc.filter((l) => l.tipo === lote.tipo).sort(recentes).slice(0, 6);
    if (!anteriorTanque && !mesmaFase.length) {
      return `<div class="card"><p class="mudo" style="margin:0">Ainda não há ciclos de ${esc(lote.especie)} encerrados para comparar. Quando um lote for encerrado (Tanques &gt; lote &gt; Encerrar), este quadro mostra como este ciclo está em relação aos anteriores na mesma idade.</p></div>`;
    }
    const ids = [...new Set([anteriorTanque && anteriorTanque.id, ...mesmaFase.map((l) => l.id)].filter(Boolean))];
    const dados = Object.fromEntries(await Promise.all(ids.map(async (lid) => [lid, await ctx.api.dadosLote(lid).catch(() => null)])));
    const idade = c.diasCultivo;
    const naIdade = (l) => { const d = dados[l.id]; return d ? calcularNaIdade(l, d.bios, d.mort, d.rac, idade, precoKg) : null; };
    const porMil = (x, l) => (x && Number(l.quantidade_inicial) > 0 ? (x.racaoTotal / Number(l.quantidade_inicial)) * 1000 : null);
    const ant = anteriorTanque ? naIdade(anteriorTanque) : null;
    const fase = mesmaFase.map((l) => ({ l, x: naIdade(l) })).filter((o) => o.x);
    const med = (k) => mediaDe(fase.map((o) => o.x), k);
    const medPorMil = mediaDe(fase.map((o) => ({ v: porMil(o.x, o.l) })), 'v');
    const g = (v) => (v == null ? '—' : v >= 1000 ? `${fmtNum(v / 1000, 2)} kg` : `${fmtNum(v, v < 10 ? 1 : 0)} g`);
    // [rótulo, este lote, ciclo anterior, média, formato, maior é melhor? (null = neutro)]
    const linhas = [
      ['Peso médio', c.pmAtualG, ant && ant.pmAtualG, med('pmAtualG'), g, true],
      ['Ganho diário', c.gpd, ant && ant.gpd, med('gpd'), (v) => (v == null ? '—' : `${fmtNum(v, 1)} g/dia`), true],
      ['Conversão alimentar', c.ca, ant && ant.ca, med('ca'), (v) => (v == null ? '—' : fmtNum(v, 2)), false],
      ['Sobrevivência', c.sobrevivencia, ant && ant.sobrevivencia, med('sobrevivencia'), (v) => (v == null ? '—' : `${fmtPct(v)}%`), true],
      ['Ração por mil peixes', porMil(c, lote), ant && porMil(ant, anteriorTanque), medPorMil, (v) => (v == null ? '—' : `${fmtNum(v, 0)} kg`), null],
      ...(gerir ? [['Custo da ração por kg produzido', c.custoKgProduzido, ant && ant.custoKgProduzido, med('custoKgProduzido'), (v) => (v == null ? '—' : fmtBRL(v)), false]] : []),
    ];
    // marca melhor/pior em relação à média da fase (ou ao ciclo anterior); só diferenças de 5% ou mais
    const marca = (este, ref, maior) => {
      if (maior == null || este == null || ref == null || !ref) return '';
      const dif = (este - ref) / Math.abs(ref);
      if (Math.abs(dif) < 0.05) return '<span class="cmp-tag igual">na média</span>';
      const melhor = maior ? dif > 0 : dif < 0;
      return `<span class="cmp-tag ${melhor ? 'melhor' : 'pior'}">${melhor ? 'melhor' : 'pior'} ${fmtInt(Math.abs(dif) * 100)}%</span>`;
    };
    const colAnt = anteriorTanque ? `<th class="n">Ciclo anterior<small>${esc(nomeTanque)} · ${fmtData(anteriorTanque.data_entrada)}</small></th>` : '';
    const colMed = fase.length ? `<th class="n">Média da fazenda<small>${fmtInt(fase.length)} ${fase.length === 1 ? 'ciclo' : 'ciclos'} de ${esc((ROTULO_TIPO[lote.tipo] || lote.tipo).toLowerCase())}</small></th>` : '';
    const tabela = `<div class="card"><table class="cmp">
      <thead><tr><th>No dia ${fmtInt(idade)} do ciclo</th><th class="n">Este lote</th>${colAnt}${colMed}</tr></thead>
      <tbody>${linhas.map(([r, e, a, m, f, maior]) => `<tr><td>${r}</td><td class="n" data-r="Este lote"><b>${f(e)}</b>${marca(e, fase.length ? m : a, maior)}</td>${anteriorTanque ? `<td class="n" data-r="Ciclo anterior">${f(a)}</td>` : ''}${fase.length ? `<td class="n" data-r="Média">${f(m)}</td>` : ''}</tr>`).join('')}</tbody></table></div>`;
    const tagTxt = (este, ref, maior) => marca(este, ref, maior).replace(/<[^>]+>/g, '');
    cmpPdf = {
      idade,
      cab: ['INDICADOR', 'ESTE LOTE', ...(anteriorTanque ? [`CICLO ANTERIOR (${fmtData(anteriorTanque.data_entrada)})`] : []), ...(fase.length ? [`MÉDIA (${fase.length} ${fase.length === 1 ? 'CICLO' : 'CICLOS'})`] : [])],
      corpo: linhas.map(([r, e, a, m, f, maior]) => { const t = tagTxt(e, fase.length ? m : a, maior); return [r, `${f(e)}${t ? ` (${t})` : ''}`, ...(anteriorTanque ? [f(a)] : []), ...(fase.length ? [f(m)] : [])]; }),
      fim: '',
    };
    let fim = '';
    const dAnt = anteriorTanque && dados[anteriorTanque.id];
    if (dAnt) {
      const dataFim = fimDoLote(anteriorTanque, dAnt.bios, dAnt.mort, dAnt.rac, hoje);
      const fz = calcularLote(anteriorTanque, dAnt.bios, dAnt.mort, dAnt.rac, dataFim, precoKg);
      const dur = Math.max(0, Math.round((new Date(`${dataFim}T12:00:00`) - new Date(`${anteriorTanque.data_entrada}T12:00:00`)) / 864e5));
      cmpPdf.fim = `O ciclo anterior deste tanque durou ${fmtInt(dur)} dias e terminou com ${g(fz.pmAtualG)}${fz.ca != null ? `, conversão ${fmtNum(fz.ca, 2)}` : ''} e ${fmtPct(fz.sobrevivencia)}% de sobrevivência.`;
      fim = `<p class="cmp-fim">O ciclo anterior deste tanque durou <b>${fmtInt(dur)} dias</b> e terminou com <b>${g(fz.pmAtualG)}</b>${fz.ca != null ? `, conversão <b>${fmtNum(fz.ca, 2)}</b>` : ''} e <b>${fmtPct(fz.sobrevivencia)}%</b> de sobrevivência${gerir && fz.custoKgProduzido != null ? ` (ração a ${fmtBRL(fz.custoKgProduzido)} por kg produzido)` : ''}.</p>`;
    }
    return `${tabela}${fim}<p class="mudo nota">Comparação na mesma idade: os ciclos anteriores são recortados no dia ${fmtInt(idade)} depois da entrada; ciclo encerrado termina no último registro. Melhor/pior em relação à ${fase.length ? 'média da fazenda' : 'ciclo anterior'}, só com 5% ou mais de diferença.</p>`;
  }
  const pintarCmp = (h) => { cmpHtml = h; const box = el.querySelector('#cmp-ciclos'); if (box) box.innerHTML = `<h2>Comparação com ciclos anteriores</h2>${h}`; };
  compararCiclos().then(pintarCmp).catch(() => pintarCmp('<div class="card"><p class="mudo" style="margin:0">Não foi possível buscar os ciclos anteriores agora.</p></div>'));

  const abas = [['resumo', 'Resumo'], ['peso', 'Peso'], ['racao', 'Ração'], ...(gerir ? [['registros', 'Registros']] : [])];
  let aba = 'resumo';

  const painelResumo = () => `
    <div class="card destaques3">
      ${destaque('Peso médio atual', c.pmAtualG != null ? unid(fmtNum(c.pmAtualG, 0), 'g') : '—', c.pmAtualG != null ? `em ${fmtData(c.dataUltimaBio)}` : 'sem biometria ainda')}
      ${destaque('Ração fornecida', unid(fmtNum(c.racaoTotal, 0), 'kg'), `≈ ${fmtNum(c.racaoTotal / kgS, 1)} sacos` + (c.racaoMediaDia != null ? ` · média ${fmtNum(c.racaoMediaDia, 1)} kg/dia` : ''))}
      ${destaque('Conversão alimentar', c.ca != null ? fmtNum(c.ca, 2) : '—', c.ca != null ? 'kg de ração por kg ganho' : c.dataUltimaBio ? 'aparece quando houver ração lançada até a última biometria' : 'precisa de biometria com ganho')}
    </div>
    <section class="bloco"><h2>Situação do lote</h2>
      <div class="card"><ul class="lista numeros">
        ${linhaNum('Dias de cultivo', fmtInt(c.diasCultivo))}
        ${linhaNum('Peixes vivos (estim.)', fmtInt(c.vivos), `${fmtPct(c.sobrevivencia)}% de sobrevivência · ${fmtInt(c.mortos)} mortos`)}
        ${linhaNum('Biomassa estimada', c.biomassaAtual != null ? fmtNum(c.biomassaAtual, 0) + ' kg' : '—', `na entrada: ${fmtNum(c.biomassaInicial, 0)} kg`)}
        ${gerir ? linhaNum('Custo de ração', c.custoRacao != null ? fmtBRL(c.custoRacao) : '—', c.custoRacao != null ? 'pelo preço médio pago por kg' : 'registre o valor nas compras') : ''}
        ${gerir ? linhaNum('Custo de ração por kg produzido', c.custoKgProduzido != null ? fmtBRL(c.custoKgProduzido) : '—', c.custoKgProduzido != null ? 'ração até a última biometria ÷ peixe que ganhou peso' : 'precisa de preço nas compras e biometria com ganho') : ''}
      </ul></div>
      <p class="mudo nota">Valores estimados usam o peso médio da última biometria e a mortalidade registrada. Quanto mais biometrias, mais confiável.</p>
    </section>
    <section class="bloco" id="cmp-ciclos"><h2>Comparação com ciclos anteriores</h2>${cmpHtml || '<div class="card"><p class="mudo" style="margin:0">Buscando os ciclos anteriores…</p></div>'}</section>`;

  const painelPeso = () => {
    const ev = evolucaoPeso(lote, bios);
    return `
    <div class="card destaques3">
      ${destaque('Peso médio atual', c.pmAtualG != null ? unid(fmtNum(c.pmAtualG, 0), 'g') : '—', `na entrada: ${fmtNum(c.pmInicialG, 1)} g`)}
      ${destaque('Ganho diário', c.gpd != null ? unid(fmtNum(c.gpd, 2), 'g/dia') : '—', 'por peixe, desde a entrada')}
    </div>
    <section class="bloco"><h2>Evolução do peso médio</h2><div class="card">${svgPeso(pontosPeso(lote, bios))}</div></section>
    <section class="bloco"><h2>Biometrias <span class="contagem">${bios.length}</span></h2>
      <div class="card tabela">${ev.length > 1 ? `<table><thead><tr><th>Data</th><th class="n">Peso médio</th><th class="n">Ganho</th></tr></thead><tbody>
        ${[...ev].reverse().map((p) => `<tr><td>${fmtData(p.data)}${p.inicial ? ' <small>entrada</small>' : ''}</td><td class="n"><b>${fmtNum(p.g, p.g < 10 ? 1 : 0)} g</b></td><td class="n">${p.ganhoDia != null ? fmtNum(p.ganhoDia, 1) + ' g/dia' : '—'}</td></tr>`).join('')}
      </tbody></table>` : '<p class="mudo" style="margin:0">Nenhuma biometria registrada.</p>'}</div>
    </section>`;
  };

  const painelRacao = () => {
    const sem = racaoPorSemana(rac);
    const recentes = [...rac].reverse().slice(0, 14);
    return `
    <div class="card destaques3">
      ${destaque('Ração fornecida', unid(fmtNum(c.racaoTotal, 0), 'kg'), `≈ ${fmtNum(c.racaoTotal / kgS, 1)} sacos` + (c.racaoMediaDia != null ? ` · média ${fmtNum(c.racaoMediaDia, 1)} kg/dia` : ''))}
      ${gerir ? destaque('Custo de ração', c.custoRacao != null ? fmtBRL(c.custoRacao) : '—', c.custoRacao != null ? 'pelo preço médio pago por kg' : 'registre o valor nas compras') : ''}
      ${gerir && c.custoKgProduzido != null ? destaque('Custo por kg produzido', fmtBRL(c.custoKgProduzido), 'só a ração, por kg de peixe ganho') : ''}
    </div>
    <section class="bloco"><h2>Por semana</h2><div class="card">${svgSemanas(sem)}</div></section>
    <section class="bloco"><h2>Últimos lançamentos</h2>
      <div class="card tabela">${recentes.length ? `<table><thead><tr><th>Data</th><th class="n">Ração</th></tr></thead><tbody>
        ${recentes.map((r) => `<tr><td>${fmtData(r.data)}</td><td class="n"><b>${fmtNum(r.quantidade_kg, 1)} kg</b></td></tr>`).join('')}
      </tbody></table>${rac.length > 14 ? '<p class="mudo nota">Mostrando os 14 mais recentes. A lista completa está em Registros.</p>' : ''}` : '<p class="mudo" style="margin:0">Nenhuma ração lançada.</p>'}</div>
    </section>`;
  };

  const painelRegistros = () => `
    ${secao('Ração lançada', [...rac].reverse().map((r) => registro(r.data, r.registrado_por, `${fmtNum(r.quantidade_kg, 1)} kg (≈ ${fmtNum(r.quantidade_kg / kgS, 1)} sacos)`, 'racao_consumo', r.id)), 'Nenhuma ração lançada.')}
    ${secao('Biometrias', [...bios].reverse().map((b) => registro(b.data, b.registrado_por, `${fmtNum(pesoMedioKg(b) * 1000, 0)} g<small>${fmtInt(b.quantidade_amostrada)} peixes · ${fmtNum(b.peso_amostra_kg, 3)} kg</small>`, 'biometrias', b.id)), 'Nenhuma biometria registrada.')}
    ${secao('Mortalidade', [...mort].reverse().map((m) => registro(m.data, m.registrado_por, `${fmtInt(m.quantidade)} peixes${m.causa ? `<small class="causa">${esc(m.causa)}</small>` : ''}`, 'mortalidade', m.id)), 'Nenhuma mortalidade registrada.')}`;

  const paineis = { resumo: painelResumo, peso: painelPeso, racao: painelRacao, registros: painelRegistros };

  el.innerHTML = `
    <p class="no-print"><a class="voltar" href="#/relatorio">${icone('voltar', 18)} Relatórios</a></p>
    <h1>${esc(nomeTanque)} · ${esc(lote.especie)}</h1>
    <p class="mudo cab-lote"><span class="fase ${faseCss(lote.tipo)}"></span>${esc(ROTULO_TIPO[lote.tipo] || lote.tipo)} · entrada em ${fmtData(lote.data_entrada)} · ${lote.ativo ? 'lote ativo' : 'lote encerrado'}</p>
    <div class="seg no-print" style="--n:${abas.length}" role="tablist">${abas.map(([k, r]) => `<button type="button" data-aba="${k}">${r}</button>`).join('')}</div>
    <div id="painel"></div>
    <div class="acoes no-print">
      <button class="btn primario" id="b-pdf" type="button">Gerar PDF para compartilhar</button>
      <button class="btn" id="b-csv" type="button">Baixar planilha (CSV)</button>
    </div>`;

  const painel = el.querySelector('#painel');
  function pintar() {
    el.querySelectorAll('.seg button').forEach((b) => b.classList.toggle('on', b.dataset.aba === aba));
    painel.innerHTML = paineis[aba]();
    painel.querySelectorAll('[data-del]').forEach((b) =>
      b.addEventListener('click', async () => {
        const [tab, rid] = b.dataset.del.split(':');
        if (!(await confirmar({ titulo: 'Excluir este lançamento?', texto: 'Os totais do relatório serão recalculados.', ok: 'Excluir', perigo: true }))) return;
        try { await ctx.api.excluir(tab, rid); ctx.toast('Lançamento excluído', 'ok'); renderRelatorioLote(ctx, el, id); }
        catch (e) { ctx.toast(e.message, 'erro'); }
      }));
    painel.querySelectorAll('[data-edit]').forEach((b) =>
      b.addEventListener('click', async () => {
        const [tab, rid] = b.dataset.edit.split(':');
        if (!navigator.onLine) return ctx.toast('Sem internet', 'erro');
        const campos = camposEdicao(tab, rid);
        if (!campos) return;
        const v = await formulario({ titulo: 'Corrigir lançamento', texto: 'Os totais do relatório serão recalculados.', campos: campos.lista, validar: campos.validar });
        if (!v) return;
        try { await ctx.api.atualizar(tab, rid, campos.montar(v)); ctx.toast('Lançamento corrigido', 'ok'); renderRelatorioLote(ctx, el, id); }
        catch (e) { ctx.toast(e.message, 'erro'); }
      }));
  }

  // campos da janela de correção de cada tipo de lançamento
  function camposEdicao(tab, rid) {
    const dataCampo = (valor) => ({ nome: 'data', rotulo: 'Data', tipo: 'date', valor, min: lote.data_entrada, max: hoje });
    const dataOk = (d) => (!d ? 'Informe a data.' : d > hoje ? 'A data não pode ser no futuro.' : d < lote.data_entrada ? `A data não pode ser antes da entrada do lote (${fmtData(lote.data_entrada)}).` : null);
    if (tab === 'racao_consumo') {
      const r = rac.find((x) => x.id === rid); if (!r) return null;
      return {
        lista: [dataCampo(r.data), { nome: 'kg', rotulo: 'Ração (kg)', tipo: 'number', valor: r.quantidade_kg, step: '0.1', min: '0.1', inputmode: 'decimal', ajuda: `1 saco = ${fmtNum(kgS, 0)} kg` }],
        validar: (v) => dataOk(v.data) || (num(v.kg) > 0 ? null : 'Informe a quantidade de ração em kg.'),
        montar: (v) => ({ data: v.data, quantidade_kg: num(v.kg) }),
      };
    }
    if (tab === 'biometrias') {
      const b = bios.find((x) => x.id === rid); if (!b) return null;
      return {
        lista: [dataCampo(b.data),
          { nome: 'qtd', rotulo: 'Peixes pesados', tipo: 'number', valor: b.quantidade_amostrada, step: '1', min: '1', inputmode: 'numeric' },
          { nome: 'peso', rotulo: 'Peso total da amostra (kg)', tipo: 'number', valor: b.peso_amostra_kg, step: '0.001', min: '0.001', inputmode: 'decimal' }],
        validar: (v) => dataOk(v.data) || (Number.isInteger(num(v.qtd)) && num(v.qtd) >= 1 ? null : 'Informe quantos peixes foram pesados (número inteiro).') || (num(v.peso) > 0 ? null : 'Informe o peso da amostra em kg.'),
        montar: (v) => ({ data: v.data, quantidade_amostrada: num(v.qtd), peso_amostra_kg: num(v.peso) }),
      };
    }
    if (tab === 'mortalidade') {
      const m = mort.find((x) => x.id === rid); if (!m) return null;
      const opcoes = [['', 'Não informada'], ...CAUSAS_MORTE.map(([c]) => [c, c])];
      if (m.causa && !opcoes.some(([c]) => c === m.causa)) opcoes.push([m.causa, m.causa]);
      return {
        lista: [dataCampo(m.data),
          { nome: 'qtd', rotulo: 'Peixes mortos', tipo: 'number', valor: m.quantidade, step: '1', min: '1', inputmode: 'numeric' },
          { nome: 'causa', rotulo: 'Causa provável', tipo: 'select', valor: m.causa || '', opcoes }],
        validar: (v) => dataOk(v.data) || (Number.isInteger(num(v.qtd)) && num(v.qtd) >= 1 ? null : 'Informe quantos peixes morreram (número inteiro).'),
        montar: (v) => ({ data: v.data, quantidade: num(v.qtd), causa: v.causa || null }),
      };
    }
    return null;
  }
  el.querySelectorAll('.seg button').forEach((b) => b.addEventListener('click', () => { aba = b.dataset.aba; pintar(); }));
  pintar();

  const bpdf = el.querySelector('#b-pdf');
  bpdf.addEventListener('click', async () => {
    if (!navigator.onLine) return ctx.toast('Sem internet', 'erro');
    const texto = bpdf.textContent; bpdf.disabled = true; bpdf.textContent = 'Gerando PDF…';
    try {
      const [jsPDF, fontes] = await Promise.all([carregarGerador(), carregarFontes()]);
      const doc = gerarPdfLote(jsPDF, {
        logo: ctx.state.ref.logo || null, fazenda: (ctx.state.perfil.fazendas && ctx.state.perfil.fazendas.nome) || 'Piscicultura', lote, nomeTanque, c, bios, mort, rac,
        evo: evolucaoPeso(lote, bios), semanas: racaoPorSemana(rac), kgSaco: kgS, gerir, geradoEm: hoje, fontes, cmp: cmpPdf,
      });
      const blob = doc.output('blob');
      const nome = nomeArquivo(['Relatório do lote', nomeTanque || 'Tanque', lote.especie, `lote de ${dataArquivo(lote.data_entrada)}`, dataArquivo(hoje)], 'pdf');
      bpdf.disabled = false; bpdf.textContent = texto;
      await abrirVisualizador({ blob, nome, titulo: `${nomeTanque} · ${lote.especie}`, toast: ctx.toast });
    } catch (e) { ctx.toast(e.message || 'Não foi possível gerar o PDF', 'erro'); bpdf.disabled = false; bpdf.textContent = texto; }
  });
  el.querySelector('#b-csv').addEventListener('click', () => baixarCsv(nomeArquivo(['Relatório do lote', nomeTanque || 'Tanque', lote.especie, `lote de ${dataArquivo(lote.data_entrada)}`, dataArquivo(hojeISO())], 'csv'), montarCsv(lote, nomeTanque, c, bios, mort, rac, quem)));
}

function baixarCsv(nome, texto) {
  const blob = new Blob([texto], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = nome;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

// Barras de ração por semana (kg)
function svgSemanas(sem) {
  if (!sem.length) return '<p class="mudo" style="margin:0">Nenhuma ração lançada.</p>';
  const ult = sem.slice(-12);
  const W = 320, H = 150, pl = 8, pr = 8, pt = 16, pb = 24;
  const max = Math.max(...ult.map((s) => s.kg));
  const larg = (W - pl - pr) / ult.length;
  const barras = ult.map((s, i) => {
    const h = max > 0 ? ((H - pt - pb) * s.kg) / max : 0;
    const x = pl + i * larg + larg * 0.18, w = larg * 0.64, y = H - pb - h;
    const [, m, d] = s.inicio.split('-');
    return `<rect class="barra" x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${Math.max(h, 1).toFixed(1)}" rx="3"/>
      ${ult.length <= 8 || i % 2 === 0 ? `<text x="${(x + w / 2).toFixed(1)}" y="${H - 8}" text-anchor="middle">${d}/${m}</text>` : ''}
      ${ult.length <= 8 ? `<text x="${(x + w / 2).toFixed(1)}" y="${(y - 4).toFixed(1)}" text-anchor="middle">${fmtNum(s.kg, 0)}</text>` : ''}`;
  }).join('');
  return `<svg class="grafico" viewBox="0 0 ${W} ${H}" role="img" aria-label="Ração por semana">${barras}</svg>
    <p class="mudo nota" style="margin:.4rem 0 0">Cada barra é uma semana (início na segunda-feira), em kg.</p>`;
}

// Barras de ração por dia (kg), do mais antigo ao mais recente
function svgDias(linhasDia) {
  const dias = linhasDia.slice().reverse();
  const W = 320, H = 130, pl = 6, pr = 6, pt = 14, pb = 20;
  const max = Math.max(...dias.map((d) => d.kg), 1);
  const larg = (W - pl - pr) / dias.length;
  const passo = dias.length > 14 ? 5 : dias.length > 8 ? 2 : 1;
  const barras = dias.map((d, i) => {
    const h = ((H - pt - pb) * d.kg) / max;
    const x = pl + i * larg + larg * 0.14, w = larg * 0.72, y = H - pb - h;
    const [, m, dd] = d.data.split('-');
    const rot = (dias.length - 1 - i) % passo === 0 ? `<text x="${(x + w / 2).toFixed(1)}" y="${H - 6}" text-anchor="middle">${dd}/${m}</text>` : '';
    return `<rect class="barra${i === dias.length - 1 ? ' hoje' : ' cinza'}" x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${Math.max(h, d.kg > 0 ? 1.5 : 0.8).toFixed(1)}" rx="${Math.min(3, w / 2).toFixed(1)}"/>${rot}`;
  }).join('');
  return `<svg class="grafico" viewBox="0 0 ${W} ${H}" role="img" aria-label="Ração por dia">${barras}</svg>`;
}

// Ração por tanque: o relatório que o responsável manda ao dono (dia ou semana)
export async function renderRacaoDia(ctx, el) {
  el.innerHTML = '<p class="carregando">Montando relatório…</p>';
  if (!navigator.onLine) {
    el.innerHTML = `<p><a class="voltar" href="#/relatorio">${icone('voltar', 18)} Relatórios</a></p><h1>Ração por dia</h1><div class="card vazio"><p>Este relatório precisa de internet.</p></div>`;
    return;
  }
  const tanques = ctx.state.ref.tanques;
  const lotesAtivos = (ctx.state.ref.lotes || []).filter((l) => l.ativo !== false);
  const kgS = ctx.state.ref.kgSaco || PESO_SACO_PADRAO_KG;
  const fazenda = (ctx.state.perfil.fazendas && ctx.state.perfil.fazendas.nome) || 'Piscicultura';
  const hoje = hojeISO();
  const somaDias = (iso, n) => { const d = new Date(`${iso}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  const [linhas, resumoLista] = await Promise.all([ctx.api.racaoPeriodo(somaDias(hoje, -59)), ctx.api.resumoLotes().catch(() => [])]);
  const resumo = Object.fromEntries((resumoLista || []).map((x) => [x.lote_id, x]));
  // lote e peso estimado dos peixes de cada tanque (para "% do peso vivo")
  const infoTanque = (tid) => {
    const ls = lotesAtivos.filter((l) => l.tanque_id === tid);
    if (!ls.length) return { lote: '', vivos: null, biomassaKg: null, fase: null };
    const lote = ls.length > 1 ? `${ls.length} lotes` : `${ls[0].especie} · ${(ROTULO_TIPO[ls[0].tipo] || ls[0].tipo || '').toLowerCase()}`;
    let vivos = 0, bio = 0, temPeso = true;
    for (const l of ls) {
      const r0 = resumo[l.id];
      const v = Math.max(0, Number(l.quantidade_inicial) - Number((r0 && r0.mortos) || 0));
      vivos += v;
      if (r0 && r0.ultimo_peso_medio_kg != null) bio += v * Number(r0.ultimo_peso_medio_kg); else temPeso = false;
    }
    return { lote, vivos, biomassaKg: temPeso && bio > 0 ? bio : null, fase: ls.every((l) => l.tipo === ls[0].tipo) ? ls[0].tipo : null };
  };
  const nat = (a, b) => String(a).localeCompare(String(b), 'pt-BR', { numeric: true, sensitivity: 'base' });
  const diaSemana = (iso) => new Intl.DateTimeFormat('pt-BR', { weekday: 'long', timeZone: 'UTC' }).format(new Date(`${iso}T00:00:00Z`)).replace(/^./, (c) => c.toUpperCase());
  const diaCurto = (iso) => {
    const wd = new Intl.DateTimeFormat('pt-BR', { weekday: 'short', timeZone: 'UTC' }).format(new Date(`${iso}T00:00:00Z`)).replace('.', '');
    return `${wd} ${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
  };
  const f1 = (v) => fmtNum(v, Math.abs(v - Math.round(v)) < 0.05 ? 0 : 1);
  const sacos = (v) => f1(v / kgS);
  const kgTxt = (v) => fmtNum(v, v % 1 ? 1 : 0);
  const kg = (v) => (v == null ? '<span class="vazio-cel">–</span>' : kgTxt(v));

  let per = 'hoje'; let outro = hoje; const desmarcados = new Set(); // tanques fora do relatório (vazio = todos)
  const intervalo = () => {
    if (per === 'hoje') return [hoje, hoje];
    if (per === 'ontem') return [somaDias(hoje, -1), somaDias(hoje, -1)];
    if (per === 'dia') return [outro, outro];
    const n = Number(per); return [somaDias(hoje, -(n - 1)), hoje];
  };

  function calcular() {
    const [ini, fim] = intervalo();
    const dias = [];
    for (let d = fim; d >= ini; d = somaDias(d, -1)) dias.push(d);
    const noPeriodo = linhas.filter((r) => r.data >= ini && r.data <= fim);
    const porTanque = new Map(); const porDia = new Map();
    for (const r of noPeriodo) {
      const q = Number(r.quantidade_kg) || 0;
      porTanque.set(r.tanque_id, (porTanque.get(r.tanque_id) || 0) + q);
      const m = porDia.get(r.data) || new Map(); m.set(r.tanque_id, (m.get(r.tanque_id) || 0) + q); porDia.set(r.data, m);
    }
    const ativosIds = new Set(lotesAtivos.map((l) => l.tanque_id));
    const todos = tanques.filter((t) => porTanque.has(t.id) || ativosIds.has(t.id))
      .map((t) => {
        const kg = porTanque.get(t.id) || 0; const inf = infoTanque(t.id);
        return { id: t.id, nome: t.nome, kg, ativo: ativosIds.has(t.id), ...inf, pesoVivoPct: inf.biomassaKg ? ((kg / dias.length) / inf.biomassaKg) * 100 : null };
      }).sort((a, b) => nat(a.nome, b.nome));
    const lista = todos.filter((t) => !desmarcados.has(t.id));
    const linhasDia = dias.map((d) => {
      const m = porDia.get(d) || new Map(); const por = {}; let tot = 0;
      lista.forEach((t) => { por[t.nome] = m.has(t.id) ? m.get(t.id) : null; tot += m.get(t.id) || 0; });
      return { data: d, kg: tot, por };
    });
    const total = lista.reduce((s, t) => s + t.kg, 0);
    const um = ini === fim;
    const rotulo = um ? (fim === hoje ? 'Hoje' : fim === somaDias(hoje, -1) ? 'Ontem' : diaSemana(fim)) : `Últimos ${dias.length} dias`;
    const periodo = um ? `${diaSemana(fim)}, ${fmtData(fim)}` : `${fmtData(ini).slice(0, 5)} a ${fmtData(fim)}`;
    // mesmo tamanho de período, logo antes (para comparar)
    const antFim = somaDias(ini, -1), antIni = somaDias(ini, -dias.length);
    const idsLista = new Set(lista.map((t) => t.id));
    const antKg = linhas.filter((x) => x.data >= antIni && x.data <= antFim && idsLista.has(x.tanque_id)).reduce((t, x) => t + (Number(x.quantidade_kg) || 0), 0);
    const anterior = { kg: antKg, rotulo: um ? 'Vs. dia anterior' : `Vs. ${dias.length} dias antes` };
    const individual = lista.length === 1 && todos.length > 1;
    const parcial = lista.length > 1 && lista.length < todos.length;
    const nomePer = um ? (fim === hoje ? 'Ração de hoje' : fim === somaDias(hoje, -1) ? 'Ração de ontem' : 'Ração do dia') : `Ração dos últimos ${dias.length} dias`;
    const titulo = individual ? lista[0].nome : nomePer;
    const periodoPdf = individual ? `${nomePer} · ${periodo}` : parcial ? `${periodo} · ${lista.length} de ${todos.length} tanques` : periodo;
    return { ini, fim, dias, todos, lista, linhasDia, total, um, rotulo, periodo, colunas: lista.map((t) => t.nome), anterior, individual, parcial, titulo, periodoPdf };
  }

  el.innerHTML = `
    <p class="no-print"><a class="voltar" href="#/relatorio">${icone('voltar', 18)} Relatórios</a></p>
    <h1>Ração fornecida</h1>
    <div class="seg no-print" style="--n:4" role="tablist">${[['hoje', 'Hoje'], ['ontem', 'Ontem'], ['7', '7 dias'], ['30', '30 dias']].map(([k, t]) => `<button type="button" data-per="${k}">${t}</button>`).join('')}</div>
    <label class="outro-dia no-print">Ou escolha um dia<input type="date" id="outro" max="${hoje}" value="${hoje}"></label>
    <div id="resumo"></div>
    <div id="corpo"></div>
    <div class="msg-acoes no-print" id="acoes-racao">
      <button class="btn primario grande" id="b-pdf-racao" type="button">Enviar relatório (PDF)</button>
    </div>
    <p class="no-print" style="text-align:center;margin:1.2rem 0 .4rem"><button class="link" id="b-csv" type="button">Baixar planilha (CSV)</button></p>`;

  let r = null;
  // ração do período dividida por fase do lote (só quando há mais de uma fase)
  function pizzaFase(lista) {
    const porFase = {};
    for (const t of lista) if (t.kg > 0 && t.fase) porFase[t.fase] = (porFase[t.fase] || 0) + t.kg;
    const fases = ORDEM_FASE.filter((f) => porFase[f] > 0);
    if (fases.length < 2) return '';
    return `<div class="pz-faixa">${pizza(fases.map((f) => ({ nome: ROTULO_TIPO[f] || f, valor: porFase[f], cor: COR_FASE[f], txt: `${sacos(porFase[f])} sacos` })), { centro: sacos(Object.values(porFase).reduce((a, b) => a + b, 0)), sub: 'sacos', rotulo: 'Ração por fase' })}</div>`;
  }
  function pintar() {
    el.querySelectorAll('[data-per]').forEach((b) => b.classList.toggle('on', b.dataset.per === per));
    r = calcular();
    const marcado = (t) => !desmarcados.has(t.id);
    const maxKg = Math.max(1, ...r.todos.map((t) => t.kg || 0));
    const ranque = r.todos.map((t) => `
      <li class="racao-item${marcado(t) ? '' : ' fora'}"><label class="marca no-print" title="Incluir no relatório"><input type="checkbox" data-marca="${esc(t.id)}"${marcado(t) ? ' checked' : ''}><span></span></label><span class="esq"><b>${esc(t.nome)}</b>${t.kg > 0 || t.lote ? `<small>${[t.kg > 0 ? `${kgTxt(t.kg)} kg` : '', t.lote, t.pesoVivoPct != null && t.kg > 0 ? `${fmtNum(t.pesoVivoPct, 1)}% do peso vivo` : ''].filter(Boolean).map(esc).join(' · ')}</small>` : ''}${t.kg > 0 ? progresso((t.kg / maxKg) * 100, { fina: true, rotulo: `${t.nome}: ${kgTxt(t.kg)} kg` }) : ''}</span>
      ${t.kg > 0 ? `<b class="valor">${sacos(t.kg)} <small>sacos</small></b>` : `<span class="tag ${t.ativo ? 'aviso' : ''}">${t.ativo ? 'sem lançamento' : '–'}</span>`}</li>`).join('');
    const grafico = r.um || !r.lista.length ? '' : svgDias(r.linhasDia);
    const detalhe = r.um || !r.lista.length ? '' : `
      <h2>Dia a dia</h2>
      <div class="card">${grafico}</div>
      <details class="so-cel lista-recolhe"><summary><span class="vd-ic">${icone('relatorio', 20)}</span><span class="vd-t"><b>Ver dia a dia</b><small>Toque para abrir os ${r.linhasDia.length} dias</small></span><span class="vd-seta">${icone('direita', 20)}</span></summary>
      <div class="card dias-lista">${r.linhasDia.map((d) => d.kg > 0 ? `
        <details class="dia-det"><summary><span>${diaCurto(d.data)}</span><b>${sacos(d.kg)} <small>sacos</small></b></summary>
          <ul>${r.lista.filter((t) => d.por[t.nome] != null).map((t) => `<li><span>${esc(t.nome)}</span><b>${kgTxt(d.por[t.nome])} kg</b></li>`).join('')}</ul></details>` : `
        <div class="dia-det vazio"><span>${diaCurto(d.data)}</span><small>nada lançado</small></div>`).join('')}</div></details>
      <div class="card tabela matriz rolagem so-pc"><table>
        <thead><tr><th>Dia</th>${r.lista.map((t) => `<th class="n">${esc(t.nome)}</th>`).join('')}<th class="n total">Total</th></tr></thead>
        <tbody>${r.linhasDia.map((d) => `<tr><td>${diaCurto(d.data)}</td>${r.lista.map((t) => `<td class="n">${kg(d.por[t.nome])}</td>`).join('')}<td class="n total"><b>${d.kg ? kgTxt(d.kg) : '–'}</b></td></tr>`).join('')}</tbody>
        <tfoot><tr><td>Total</td>${r.lista.map((t) => `<td class="n">${fmtNum(t.kg, 0)}</td>`).join('')}<td class="n total">${fmtNum(r.total, 0)} kg</td></tr></tfoot>
      </table></div>
      <p class="mudo nota so-pc">Valores em kg. “–” significa que nada foi lançado naquele dia.</p>
      <p class="mudo nota so-cel">Toque num dia para ver a ração de cada tanque. A tabela completa vai no PDF.</p>`;
    const quem = r.individual ? r.lista[0].nome : r.parcial ? `${r.lista.length} de ${r.todos.length} tanques` : r.todos.length > 1 ? 'todos os tanques' : '';
    el.querySelector('#resumo').innerHTML = !r.todos.length ? '' : `<div class="racao-total"><small>${esc(r.periodo)}${quem ? ` · ${esc(quem)}` : ''}</small><b>${sacos(r.total)} sacos</b><span>${kgTxt(r.total)} kg no total</span>${pizzaFase(r.lista)}${(() => { const at = r.todos.filter((t) => t.ativo), com = at.filter((t) => t.kg > 0).length; return at.length > 1 ? `<div class="hero-prog">${progresso((com / at.length) * 100, { tom: com === at.length ? 'ok' : '', rotulo: `${com} de ${at.length} tanques com ração lançada` })}<p class="h-trilho-leg"><span>${fmtInt(com)} de ${fmtInt(at.length)} tanques com ração lançada</span></p></div>` : ''; })()}</div>`;
    el.querySelector('#acoes-racao').hidden = !r.todos.length;
    const bpdf = el.querySelector('#b-pdf-racao'); bpdf.disabled = !r.lista.length;
    el.querySelector('#b-csv').disabled = !r.lista.length;
    const todosMarcados = r.lista.length === r.todos.length;
    el.querySelector('#corpo').innerHTML = !r.todos.length ? '<div class="card vazio">Nenhum tanque com lote ativo ou ração neste período.</div>' : `
      <div class="racao-cab"><h2>Por tanque</h2>${r.todos.length > 1 ? `<label class="marca-todos no-print"><input type="checkbox" id="marca-todos"${todosMarcados ? ' checked' : ''}> Marcar todos</label>` : ''}</div>
      <div class="card"><ul class="lista racao-lista com-marca">${ranque}</ul></div>
      <p class="mudo nota no-print">${!r.lista.length ? 'Marque pelo menos um tanque para gerar o relatório.' : r.individual ? `Relatório só do <b>${esc(r.lista[0].nome)}</b>.` : r.parcial ? `Relatório com ${r.lista.length} de ${r.todos.length} tanques marcados.` : 'Desmarque os tanques que não quer no relatório. Deixe só um marcado para o relatório individual.'}</p>${r.lista.length ? detalhe : ''}`;
    el.querySelectorAll('[data-marca]').forEach((c) => c.addEventListener('change', () => {
      if (c.checked) desmarcados.delete(c.dataset.marca); else desmarcados.add(c.dataset.marca);
      pintar();
    }));
    const mt = el.querySelector('#marca-todos');
    if (mt) {
      mt.indeterminate = !todosMarcados && r.lista.length > 0;
      mt.addEventListener('change', () => { desmarcados.clear(); if (!mt.checked) r.todos.forEach((t) => desmarcados.add(t.id)); pintar(); });
    }
  }
  el.querySelectorAll('[data-per]').forEach((b) => b.addEventListener('click', () => { per = b.dataset.per; pintar(); }));
  el.querySelector('#outro').addEventListener('change', (e) => { if (e.target.value) { outro = e.target.value > hoje ? hoje : e.target.value; per = 'dia'; pintar(); } });
  const nomeRacao = (ext) => nomeArquivo(['Ração fornecida', fazenda, r.individual ? r.lista[0].nome : r.parcial ? `${r.lista.length} tanques` : '', r.um ? dataArquivo(r.fim) : `${dataArquivo(r.ini)} a ${dataArquivo(r.fim)}`], ext);
  pintar();

  const bp = el.querySelector('#b-pdf-racao');
  bp.addEventListener('click', async () => {
    const t0 = bp.textContent; bp.disabled = true; bp.textContent = 'Montando o relatório…';
    try {
      const [jsPDF, fontes] = await Promise.all([carregarGerador(), carregarFontes()]);
      const agora = new Date();
      const doc = gerarPdfRacao(jsPDF, { logo: ctx.state.ref.logo || null, fazenda, geradoEm: hoje, geradoHora: `${String(agora.getHours()).padStart(2, '0')}:${String(agora.getMinutes()).padStart(2, '0')}`, geradoPor: ctx.state.perfil.nome, kgSaco: kgS, fontes, titulo: r.titulo, periodo: r.periodoPdf, dias: r.dias.length, individual: r.individual, tanques: r.lista, linhasDia: r.linhasDia, colunas: r.colunas, anterior: r.anterior });
      bp.disabled = false; bp.textContent = t0;
      await abrirVisualizador({ blob: doc.output('blob'), nome: nomeRacao('pdf'), titulo: `Ração fornecida · ${r.individual ? r.lista[0].nome + ' · ' : ''}${r.periodo}`, toast: ctx.toast });
    } catch (e) { ctx.toast(e.message || 'Não foi possível gerar o PDF', 'erro'); bp.disabled = false; bp.textContent = t0; }
  });
  el.querySelector('#b-csv').addEventListener('click', () => {
    const L = [[`Ração fornecida (kg)${r.individual ? ' · ' + r.lista[0].nome : ''}`], [r.periodo], [], ['Dia', ...r.colunas, 'Total']];
    r.linhasDia.forEach((d) => L.push([fmtData(d.data), ...r.lista.map((t) => (d.por[t.nome] == null ? '' : String(d.por[t.nome]).replace('.', ','))), String(d.kg).replace('.', ',')]));
    L.push(['Total', ...r.lista.map((t) => String(t.kg).replace('.', ',')), String(r.total).replace('.', ',')]);
    baixarCsv(nomeRacao('csv'), '\ufeff' + L.map((l) => l.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(';')).join('\r\n'));
  });
}
