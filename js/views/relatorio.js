// Relatórios por lote (precisam de internet: usam os dados já sincronizados no servidor).
import { PESO_SACO_PADRAO_KG } from '../config.js';
import { carregarGerador, abrirVisualizador } from '../pdf_ui.js';
import { gerarPdfLote } from '../pdf_lote.js';
import { confirmar } from '../dialogo.js';
import { icone } from '../icons.js';
import { esc, fmtData, fmtNum, fmtInt, fmtBRL, hojeISO, ROTULO_TIPO } from '../util.js';
import { calcularLote, precoMedioKg, pontosPeso, pesoMedioKg, evolucaoPeso, racaoPorSemana, matrizRacao } from '../calc.js';

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
    ['Conversão alimentar aparente', csvNum(calc.ca)], ['Ganho de peso diário (g/dia)', csvNum(calc.gpd)], [],
    ['RAÇÃO'], ['Data', 'Quantidade (kg)', 'Registrado por']);
  rac.forEach((r) => L.push([fmtData(r.data), csvNum(r.quantidade_kg), quem(r.registrado_por)]));
  L.push([], ['BIOMETRIAS'], ['Data', 'Peso da amostra (kg)', 'Peixes na amostra', 'Peso médio (g)', 'Registrado por']);
  bios.forEach((b) => L.push([fmtData(b.data), csvNum(b.peso_amostra_kg, 3), b.quantidade_amostrada, csvNum(pesoMedioKg(b) * 1000, 1), quem(b.registrado_por)]));
  L.push([], ['MORTALIDADE'], ['Data', 'Quantidade', 'Registrado por']);
  mort.forEach((m) => L.push([fmtData(m.data), m.quantidade, quem(m.registrado_por)]));
  return '﻿' + L.map((l) => l.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(';')).join('\r\n');
}

export async function renderRelatorios(ctx, el) {
  el.innerHTML = '<h1>Relatórios</h1><p class="carregando">Carregando…</p>';
  if (!navigator.onLine) {
    el.innerHTML = '<h1>Relatórios</h1><div class="card vazio"><p>Os relatórios precisam de internet, porque usam os dados já enviados ao servidor.</p></div>';
    return;
  }
  const lotes = await ctx.api.lotes();
  const tanques = ctx.state.ref.tanques;
  el.innerHTML = `<h1>Relatórios</h1>
    <a class="card atalho" href="#/relatorio/racao"><span class="item-ic">${icone('relatorio')}</span><span class="esq"><b>Ração por dia</b><small>Todos os tanques, dia a dia</small></span><span class="seta">${icone('direita', 20)}</span></a>
    ${tanques.length && lotes.length ? tanques.map((t) => {
      const ls = lotes.filter((l) => l.tanque_id === t.id);
      if (!ls.length) return '';
      return `<h2>${esc(t.nome)}</h2><div class="card"><ul class="lista">${ls.map((l) => `
        <li><a class="esq" href="#/relatorio/${esc(l.id)}"><b>${esc(ROTULO_TIPO[l.tipo] || l.tipo)} · ${esc(l.especie)}</b>
          <small>desde ${fmtData(l.data_entrada)} · ${fmtInt(l.quantidade_inicial)} peixes</small></a>
          <span class="tag ${l.ativo ? 'ok' : ''}">${l.ativo ? 'Ativo' : 'Encerrado'}</span></li>`).join('')}</ul></div>`;
    }).join('') : '<div class="card vazio"><p>Ainda não há lotes para mostrar.</p></div>'}`;
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
  const excluir = (tab, rid) => (gerir ? `<button class="btn mini perigo no-print" data-del="${tab}:${esc(rid)}" type="button">Excluir</button>` : '');
  const registro = (data, quemId, valor, tab, rid) => `<li><div class="esq"><b>${fmtData(data)}</b><small>${esc(quem(quemId))}</small></div><span class="valor">${valor}</span>${excluir(tab, rid)}</li>`;
  const secao = (titulo, itens, vazio) => `
    <section class="bloco"><h2>${titulo} <span class="contagem">${itens.length}</span></h2>
      <div class="card">${itens.length ? `<ul class="lista registros">${itens.join('')}</ul>` : `<p class="mudo" style="margin:0">${vazio}</p>`}</div></section>`;

  const abas = [['resumo', 'Resumo'], ['peso', 'Peso'], ['racao', 'Ração'], ...(gerir ? [['registros', 'Registros']] : [])];
  let aba = 'resumo';

  const painelResumo = () => `
    <div class="card destaques3">
      ${destaque('Peso médio atual', c.pmAtualG != null ? unid(fmtNum(c.pmAtualG, 0), 'g') : '—', c.pmAtualG != null ? `em ${fmtData(c.dataUltimaBio)}` : 'sem biometria ainda')}
      ${destaque('Ração fornecida', unid(fmtNum(c.racaoTotal, 0), 'kg'), `≈ ${fmtNum(c.racaoTotal / kgS, 1)} sacos` + (c.racaoMediaDia != null ? ` · média ${fmtNum(c.racaoMediaDia, 1)} kg/dia` : ''))}
      ${destaque('Conversão alimentar', c.ca != null ? fmtNum(c.ca, 2) : '—', c.ca != null ? 'kg de ração por kg ganho' : 'precisa de biometria com ganho')}
    </div>
    <section class="bloco"><h2>Situação do lote</h2>
      <div class="card"><ul class="lista numeros">
        ${linhaNum('Dias de cultivo', fmtInt(c.diasCultivo))}
        ${linhaNum('Peixes vivos (estim.)', fmtInt(c.vivos), `${fmtNum(c.sobrevivencia, 1)}% de sobrevivência · ${fmtInt(c.mortos)} mortos`)}
        ${linhaNum('Biomassa estimada', c.biomassaAtual != null ? fmtNum(c.biomassaAtual, 0) + ' kg' : '—', `na entrada: ${fmtNum(c.biomassaInicial, 0)} kg`)}
        ${gerir ? linhaNum('Custo de ração', c.custoRacao != null ? fmtBRL(c.custoRacao) : '—', c.custoRacao != null ? 'pelo preço médio pago por kg' : 'registre o valor nas compras') : ''}
      </ul></div>
      <p class="mudo nota">Valores estimados usam o peso médio da última biometria e a mortalidade registrada. Quanto mais biometrias, mais confiável.</p>
    </section>`;

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
    ${secao('Mortalidade', [...mort].reverse().map((m) => registro(m.data, m.registrado_por, `${fmtInt(m.quantidade)} peixes`, 'mortalidade', m.id)), 'Nenhuma mortalidade registrada.')}`;

  const paineis = { resumo: painelResumo, peso: painelPeso, racao: painelRacao, registros: painelRegistros };

  el.innerHTML = `
    <p class="no-print"><a class="voltar" href="#/relatorio">${icone('voltar', 18)} Relatórios</a></p>
    <h1>${esc(nomeTanque)} · ${esc(lote.especie)}</h1>
    <p class="mudo cab-lote"><span class="fase ${lote.tipo === 'alevinagem' ? 'alev' : 'eng'}"></span>${esc(ROTULO_TIPO[lote.tipo] || lote.tipo)} · entrada em ${fmtData(lote.data_entrada)} · ${lote.ativo ? 'lote ativo' : 'lote encerrado'}</p>
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
  }
  el.querySelectorAll('.seg button').forEach((b) => b.addEventListener('click', () => { aba = b.dataset.aba; pintar(); }));
  pintar();

  const bpdf = el.querySelector('#b-pdf');
  bpdf.addEventListener('click', async () => {
    if (!navigator.onLine) return ctx.toast('Sem internet', 'erro');
    const texto = bpdf.textContent; bpdf.disabled = true; bpdf.textContent = 'Gerando PDF…';
    try {
      const jsPDF = await carregarGerador();
      const doc = gerarPdfLote(jsPDF, {
        fazenda: (ctx.state.perfil.fazendas && ctx.state.perfil.fazendas.nome) || 'Piscicultura', lote, nomeTanque, c, bios, mort, rac,
        evo: evolucaoPeso(lote, bios), semanas: racaoPorSemana(rac), kgSaco: kgS, gerir, geradoEm: hoje,
      });
      const blob = doc.output('blob');
      const nome = `relatorio-${(nomeTanque || 'tanque').replace(/\W+/g, '-')}-${(lote.especie || '').replace(/\W+/g, '-')}-${hoje}.pdf`;
      bpdf.disabled = false; bpdf.textContent = texto;
      await abrirVisualizador({ blob, nome, titulo: `${nomeTanque} · ${lote.especie}`, toast: ctx.toast });
    } catch (e) { ctx.toast(e.message || 'Não foi possível gerar o PDF', 'erro'); bpdf.disabled = false; bpdf.textContent = texto; }
  });
  el.querySelector('#b-csv').addEventListener('click', () => baixarCsv(`relatorio-${(nomeTanque || 'tanque').replace(/\W+/g, '-')}-${lote.data_entrada}.csv`, montarCsv(lote, nomeTanque, c, bios, mort, rac, quem)));
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

// Tabela dia × tanque: o relatório que o fazendeiro fazia no papel
export async function renderRacaoDia(ctx, el) {
  el.innerHTML = '<p class="carregando">Montando tabela…</p>';
  if (!navigator.onLine) {
    el.innerHTML = `<p><a class="voltar" href="#/relatorio">${icone('voltar', 18)} Relatórios</a></p><h1>Ração por dia</h1><div class="card vazio"><p>Este relatório precisa de internet.</p></div>`;
    return;
  }
  const tanques = ctx.state.ref.tanques;
  const hoje = hojeISO();
  let dias = 7;
  const desdeDe = (n) => { const d = new Date(`${hoje}T00:00:00Z`); d.setUTCDate(d.getUTCDate() - (n - 1)); return d.toISOString().slice(0, 10); };
  const linhas = await ctx.api.racaoPeriodo(desdeDe(30));
  const diaCurto = (iso) => {
    const d = new Date(`${iso}T00:00:00Z`);
    const wd = new Intl.DateTimeFormat('pt-BR', { weekday: 'short', timeZone: 'UTC' }).format(d).replace('.', '');
    return `${wd} ${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
  };
  const kg = (v) => (v == null ? '<span class="vazio-cel">–</span>' : fmtNum(v, v % 1 ? 1 : 0));

  el.innerHTML = `
    <p class="no-print"><a class="voltar" href="#/relatorio">${icone('voltar', 18)} Relatórios</a></p>
    <h1>Ração por dia</h1>
    <div class="seg no-print" style="--n:3" role="tablist">${[7, 15, 30].map((n) => `<button type="button" data-dias="${n}">${n} dias</button>`).join('')}</div>
    <div id="matriz"></div>
    <div class="acoes no-print"><button class="btn" id="b-csv" type="button">Baixar planilha (CSV)</button><button class="btn" id="b-print" type="button">Imprimir / salvar PDF</button></div>`;

  let ultima = null;
  function pintar() {
    el.querySelectorAll('[data-dias]').forEach((b) => b.classList.toggle('on', Number(b.dataset.dias) === dias));
    const ids = tanques.map((t) => t.id);
    const m = matrizRacao(linhas.filter((r) => r.data >= desdeDe(dias)), ids, dias, hoje);
    ultima = m;
    el.querySelector('#matriz').innerHTML = !tanques.length ? '<div class="card vazio">Nenhum tanque disponível.</div>' : `
      <div class="card tabela matriz rolagem"><table>
        <thead><tr><th>Dia</th>${tanques.map((t) => `<th class="n">${esc(t.nome)}</th>`).join('')}<th class="n total">Total</th></tr></thead>
        <tbody>${m.rows.map((r) => `<tr><td>${diaCurto(r.data)}</td>${ids.map((t) => `<td class="n">${kg(r.por[t])}</td>`).join('')}<td class="n total"><b>${r.total ? fmtNum(r.total, r.total % 1 ? 1 : 0) : '–'}</b></td></tr>`).join('')}</tbody>
        <tfoot><tr><td>Total</td>${ids.map((t) => `<td class="n">${fmtNum(m.totalTanque[t], 0)}</td>`).join('')}<td class="n total">${fmtNum(m.total, 0)} kg</td></tr></tfoot>
      </table></div>
      <p class="mudo nota">Valores em kg. “–” significa que nada foi lançado naquele dia.</p>`;
  }
  el.querySelectorAll('[data-dias]').forEach((b) => b.addEventListener('click', () => { dias = Number(b.dataset.dias); pintar(); }));
  pintar();
  el.querySelector('#b-print').addEventListener('click', () => window.print());
  el.querySelector('#b-csv').addEventListener('click', () => {
    const ids = tanques.map((t) => t.id);
    const L = [['Ração por dia (kg)'], [`Últimos ${dias} dias`], [], ['Dia', ...tanques.map((t) => t.nome), 'Total']];
    ultima.rows.forEach((r) => L.push([fmtData(r.data), ...ids.map((t) => (r.por[t] == null ? '' : String(r.por[t]).replace('.', ','))), String(r.total).replace('.', ',')]));
    L.push(['Total', ...ids.map((t) => String(ultima.totalTanque[t]).replace('.', ',')), String(ultima.total).replace('.', ',')]);
    baixarCsv(`racao-por-dia-${hoje}.csv`, '﻿' + L.map((l) => l.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(';')).join('\r\n'));
  });
}
