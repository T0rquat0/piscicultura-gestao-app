// Relatórios por lote (precisam de internet: usam os dados já sincronizados no servidor).
import { esc, fmtData, fmtNum, fmtInt, fmtBRL, hojeISO, ROTULO_TIPO } from '../util.js';
import { calcularLote, precoMedioKg, pontosPeso, pesoMedioKg } from '../calc.js';

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
    el.innerHTML = '<p><a href="#/relatorio">‹ Relatórios</a></p><div class="card vazio"><p>O relatório precisa de internet.</p></div>';
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
  const quem = (uid) => nomes[uid] || (uid === ctx.state.perfil.id ? 'Você' : 'Colega');
  const hoje = hojeISO();
  const datas = [...bios, ...mort, ...rac].map((x) => x.data).sort();
  const fim = lote.ativo ? hoje : (datas.length ? datas[datas.length - 1] : hoje);
  const c = calcularLote(lote, bios, mort, rac, fim, gerir ? precoMedioKg(compras) : null);
  const nomeTanque = lote.tanques ? lote.tanques.nome : '';

  const kpi = (rotulo, valor, sub) => `<div class="kpi"><span>${rotulo}</span><b>${valor}</b>${sub ? `<small>${sub}</small>` : ''}</div>`;
  const del = (tab, rid) => (gerir ? `<td><button class="btn mini perigo no-print" data-del="${tab}:${esc(rid)}" type="button">Excluir</button></td>` : '');

  el.innerHTML = `
    <p class="no-print"><a href="#/relatorio">‹ Relatórios</a></p>
    <h1>${esc(nomeTanque)} · ${esc(lote.especie)}</h1>
    <p class="mudo">${esc(ROTULO_TIPO[lote.tipo] || lote.tipo)} · entrada em ${fmtData(lote.data_entrada)} · ${lote.ativo ? 'lote ativo' : 'lote encerrado'}</p>
    <div class="acoes no-print">
      <button class="btn mini" id="b-csv" type="button">Baixar planilha (CSV)</button>
      <button class="btn mini" id="b-print" type="button">Imprimir / salvar PDF</button>
    </div>

    <div class="kpis" style="margin-top:.9rem">
      ${kpi('Dias de cultivo', fmtInt(c.diasCultivo))}
      ${kpi('Peixes vivos (estim.)', fmtInt(c.vivos), `${fmtNum(c.sobrevivencia, 1)}% de sobrevivência · ${fmtInt(c.mortos)} mortos`)}
      ${kpi('Ração fornecida', fmtNum(c.racaoTotal, 0) + ' kg', c.racaoMediaDia != null ? `média ${fmtNum(c.racaoMediaDia, 1)} kg/dia` : '')}
      ${kpi('Peso médio atual', c.pmAtualG != null ? fmtNum(c.pmAtualG, 0) + ' g' : '—', c.pmAtualG != null ? `em ${fmtData(c.dataUltimaBio)} · entrada: ${fmtNum(c.pmInicialG, 1)} g` : 'sem biometria ainda')}
      ${kpi('Biomassa estimada', c.biomassaAtual != null ? fmtNum(c.biomassaAtual, 0) + ' kg' : '—', `entrada: ${fmtNum(c.biomassaInicial, 0)} kg`)}
      ${kpi('Conversão alimentar', c.ca != null ? fmtNum(c.ca, 2) : '—', c.ca != null ? 'kg de ração por kg ganho (aprox.)' : 'precisa de biometria com ganho')}
      ${kpi('Ganho diário', c.gpd != null ? fmtNum(c.gpd, 2) + ' g/dia' : '—', 'por peixe')}
      ${gerir ? kpi('Custo de ração', c.custoRacao != null ? fmtBRL(c.custoRacao) : '—', c.custoRacao != null ? 'pelo preço médio pago por kg' : 'registre o valor nas compras') : ''}
    </div>
    <p class="mudo">Valores marcados como estimados usam o peso médio da última biometria e a mortalidade registrada. Quanto mais biometrias, mais confiável.</p>

    <h2>Evolução do peso médio</h2>
    <div class="card">${svgPeso(pontosPeso(lote, bios))}</div>

    <details open><summary>Ração lançada (${rac.length})</summary>
      <div class="card rolagem">${rac.length ? `<table><thead><tr><th>Data</th><th class="n">kg</th><th>Quem lançou</th>${gerir ? '<th></th>' : ''}</tr></thead>
        <tbody>${[...rac].reverse().map((r) => `<tr><td>${fmtData(r.data)}</td><td class="n">${fmtNum(r.quantidade_kg, 1)}</td><td>${esc(quem(r.registrado_por))}</td>${del('racao_consumo', r.id)}</tr>`).join('')}</tbody></table>` : '<p class="mudo" style="margin:0">Nenhuma ração lançada.</p>'}</div></details>

    <details open><summary>Biometrias (${bios.length})</summary>
      <div class="card rolagem">${bios.length ? `<table><thead><tr><th>Data</th><th class="n">Amostra kg</th><th class="n">Peixes</th><th class="n">Médio g</th><th>Quem</th>${gerir ? '<th></th>' : ''}</tr></thead>
        <tbody>${[...bios].reverse().map((b) => `<tr><td>${fmtData(b.data)}</td><td class="n">${fmtNum(b.peso_amostra_kg, 3)}</td><td class="n">${fmtInt(b.quantidade_amostrada)}</td><td class="n">${fmtNum(pesoMedioKg(b) * 1000, 0)}</td><td>${esc(quem(b.registrado_por))}</td>${del('biometrias', b.id)}</tr>`).join('')}</tbody></table>` : '<p class="mudo" style="margin:0">Nenhuma biometria registrada.</p>'}</div></details>

    <details open><summary>Mortalidade (${mort.length})</summary>
      <div class="card rolagem">${mort.length ? `<table><thead><tr><th>Data</th><th class="n">Peixes</th><th>Quem</th>${gerir ? '<th></th>' : ''}</tr></thead>
        <tbody>${[...mort].reverse().map((m) => `<tr><td>${fmtData(m.data)}</td><td class="n">${fmtInt(m.quantidade)}</td><td>${esc(quem(m.registrado_por))}</td>${del('mortalidade', m.id)}</tr>`).join('')}</tbody></table>` : '<p class="mudo" style="margin:0">Nenhuma mortalidade registrada.</p>'}</div></details>`;

  el.querySelector('#b-print').addEventListener('click', () => window.print());
  el.querySelector('#b-csv').addEventListener('click', () => {
    const blob = new Blob([montarCsv(lote, nomeTanque, c, bios, mort, rac, quem)], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `relatorio-${(nomeTanque || 'tanque').replace(/\W+/g, '-')}-${lote.data_entrada}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  });
  el.querySelectorAll('[data-del]').forEach((b) =>
    b.addEventListener('click', async () => {
      const [tab, rid] = b.dataset.del.split(':');
      if (!confirm('Excluir este lançamento? Isso altera os totais do relatório.')) return;
      try { await ctx.api.excluir(tab, rid); ctx.toast('Lançamento excluído', 'ok'); renderRelatorioLote(ctx, el, id); }
      catch (e) { ctx.toast(e.message, 'erro'); }
    }));
}
