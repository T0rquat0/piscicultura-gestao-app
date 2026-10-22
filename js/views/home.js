import { esc, fmtInt, fmtNum, fmtData, hojeISO, diasEntre, ROTULO_TIPO, faseCss } from '../util.js';
import * as db from '../db.js';
import { situacaoEstoque } from '../calc.js';
import { ESTOQUE_ATENCAO_DIAS, ESTOQUE_CRITICO_DIAS, PESO_SACO_PADRAO_KG, CONTAGEM_LEMBRETE_DIAS, PLANO_AVISO_DIAS } from '../config.js';
import { icone } from '../icons.js';
import { pedirTexto } from '../dialogo.js';

export const ordemNatural = (a, b) => String(a.nome).localeCompare(String(b.nome), 'pt-BR', { numeric: true, sensitivity: 'base' });

export function statusTanque(tanque, lotes, resumo, racaoHojeLocal, hoje) {
  const meus = lotes.filter((l) => l.tanque_id === tanque.id);
  if (!meus.length) return 'semlote';
  const lancou = racaoHojeLocal.has(tanque.id) || meus.some((l) => resumo[l.id] && resumo[l.id].ultima_racao === hoje);
  return lancou ? 'ok' : 'falta';
}

export function htmlCardTanque(tanque, lotes, resumo, racaoHojeLocal, hoje) {
  const nomeLote = (l) => `${ROTULO_TIPO[l.tipo] || l.tipo} · ${l.especie}`;
  const blocos = lotes.length
    ? lotes.map((l) => {
        const r = resumo[l.id];
        const dias = diasEntre(l.data_entrada, hoje);
        const vivos = r ? Math.max(0, l.quantidade_inicial - Number(r.mortos)) : null;
        const pm = r && r.ultimo_peso_medio_kg != null ? fmtNum(r.ultimo_peso_medio_kg * 1000, 0) + '<em>g</em>' : '—';
        return `
        <section class="td-lote">
          ${lotes.length > 1 ? `<p class="lote-nome"><span class="fase ${faseCss(l.tipo)}"></span>${esc(nomeLote(l))}</p>` : ''}
          <div class="td-hero">
            <div><span>Peso médio atual</span><b>${pm}</b>${r && r.ultima_biometria ? `<small>em ${fmtData(r.ultima_biometria)}</small>` : '<small>sem biometria</small>'}</div>
            <div><span>Ração acumulada</span><b>${r ? fmtNum(r.racao_kg, 0) + '<em>kg</em>' : '—'}</b><small>desde a entrada</small></div>
          </div>
          <div class="td-stats">
            <div><span>Dias no tanque</span><b>${fmtInt(dias)}</b></div>
            <div><span>Peixes vivos (estim.)</span><b>${fmtInt(vivos ?? l.quantidade_inicial)}</b></div>
          </div>
        </section>`;
      }).join('')
    : '<div class="card vazio"><p>Sem lote ativo neste tanque.</p></div>';

  const comLote = lotes.length > 0;
  const lancouHoje = lotes.some((l) => resumo[l.id] && resumo[l.id].ultima_racao === hoje) || racaoHojeLocal.has(tanque.id);
  const selo = !comLote ? '' : lancouHoje
    ? '<span class="tag ok"><i></i>Ração lançada hoje</span>'
    : '<span class="tag alerta"><i></i>Sem ração hoje</span>';
  const sub = lotes.length === 1 ? nomeLote(lotes[0]) : lotes.length > 1 ? `${lotes.length} lotes ativos` : 'Sem lote ativo';

  return `
  <section class="tanque-card tdet ${!comLote ? 'sem-lote' : lancouHoje ? 'ok' : 'falta'}">
    <header class="td-topo"><div><h1 class="td-nome">${esc(tanque.nome)}</h1><p class="td-sub">${esc(sub)}</p></div>${selo}</header>
    ${blocos}
    ${comLote ? `<div class="td-acoes">
      <a class="btn primario grande" href="#/lancar?tipo=racao&tanque=${esc(tanque.id)}">Lançar ração</a>
      <div class="td-duo">
        <a class="btn" href="#/lancar?tipo=biometria&tanque=${esc(tanque.id)}">Biometria</a>
        <a class="btn" href="#/lancar?tipo=mortalidade&tanque=${esc(tanque.id)}">Mortalidade</a>
      </div>
    </div>` : ''}
  </section>`;
}

// Tela de um tanque (todos os papéis): números do lote e atalhos para lançar
export async function renderTanqueDetalhe(ctx, el, id) {
  const { state } = ctx;
  const tanque = state.ref.tanques.find((t) => t.id === id);
  if (!tanque) { el.innerHTML = '<p><a class="voltar" href="#/">Início</a></p><div class="card vazio">Tanque não encontrado.</div>'; return; }
  el.innerHTML = '<p class="carregando">Carregando…</p>';
  const resumo = {};
  let semDetalhe = !navigator.onLine;
  if (navigator.onLine) { try { for (const r of await ctx.api.resumoLotes()) resumo[r.lote_id] = r; } catch { semDetalhe = true; } }
  const hoje = hojeISO();
  const fila = await db.filaList();
  const racaoHojeLocal = new Set(fila.filter((i) => i.tabela === 'racao_consumo' && i.payload.data === hoje).map((i) => i.payload.tanque_id));
  const meus = state.ref.lotes.filter((l) => l.tanque_id === id);
  el.innerHTML = `<p class="no-print"><a class="voltar" href="#/">${icone('voltar', 18)} Início</a></p>
    ${semDetalhe ? '<p class="aviso">Sem conexão: os totais aparecem quando houver internet.</p>' : ''}
    ${htmlCardTanque(tanque, meus, resumo, racaoHojeLocal, hoje)}
    ${meus.length ? `<a class="hub-card td-rel" href="#/relatorio/${esc(meus[0].id)}"><span class="item-ic">${icone('relatorio')}</span><span class="esq"><b>Relatório do lote</b><small>Peso, ração e mortalidade do início até hoje</small></span><span class="seta">${icone('direita', 20)}</span></a>` : ''}`;
}

// Cria um tanque direto da tela inicial (dono/gerente). O limite do pacote é imposto no banco.
async function novoTanque(ctx, el) {
  if (!navigator.onLine) return ctx.toast('Sem internet: cadastrar tanque precisa de conexão.', 'erro');
  const nomes = ctx.state.ref.tanques.map((t) => t.nome.toLowerCase());
  const nome = await pedirTexto({
    titulo: 'Novo tanque', rotulo: 'Nome do tanque', placeholder: 'Ex.: Tanque 3', ok: 'Criar tanque',
    validar: (v) => (nomes.includes(v.toLowerCase()) ? 'Já existe um tanque com esse nome.' : ''),
  });
  if (!nome) return;
  try {
    await ctx.api.criarTanque(ctx.state.perfil.fazenda_id, nome);
    await ctx.atualizarRef();
    ctx.toast(`Tanque ${nome} criado`, 'ok');
    renderHome(ctx, el);
  } catch (e) { ctx.toast(e.message || 'Não foi possível criar o tanque', 'erro'); }
}

export async function renderHome(ctx, el) {
  const { state } = ctx;
  const primeiro = (state.perfil.nome || '').split(' ')[0];
  const { tanques, lotes } = state.ref;

  if (!tanques.length) {
    el.innerHTML = `<h1>Olá, ${esc(primeiro)}</h1>` + (ctx.podeGerir()
      ? `<div class="card vazio"><p>Nenhum tanque cadastrado ainda.</p><button class="btn primario" id="b-novo-tanque" type="button">Cadastrar o primeiro tanque</button></div>`
      : `<div class="card vazio"><p>Nenhum tanque liberado para você ainda.<br>Peça ao gerente para liberar os seus tanques.</p></div>`);
    const b0 = el.querySelector('#b-novo-tanque'); if (b0) b0.addEventListener('click', () => novoTanque(ctx, el));
    return;
  }

  el.innerHTML = `<div class="h-titulo"><h1>Hoje na fazenda</h1></div><p class="carregando">Carregando tanques…</p>`;
  const hoje = hojeISO();
  const desde = (n) => { const d = new Date(`${hoje}T00:00:00Z`); d.setUTCDate(d.getUTCDate() - n); return d.toISOString().slice(0, 10); };
  const gerir = ctx.podeGerir();
  const resumo = {};
  let semDetalhe = false, saldoRacao = null, racao = null, mortes = null;
  if (navigator.onLine) {
    const [rs, sd, rc, mt] = await Promise.all([
      ctx.api.resumoLotes().catch(() => null),
      ctx.api.saldoRacao().catch(() => null),
      ctx.api.racaoPeriodo(desde(13)).catch(() => null), // 14 dias: hoje e os 13 anteriores
      gerir ? ctx.api.mortalidadePeriodo(desde(6)).catch(() => null) : null, // 7 dias com hoje
    ]);
    if (rs) for (const r of rs) resumo[r.lote_id] = r; else semDetalhe = true;
    saldoRacao = sd; racao = rc; mortes = mt;
  } else { semDetalhe = true; }

  const fila = await db.filaList();
  const pendHoje = fila.filter((i) => i.tabela === 'racao_consumo' && i.payload.data === hoje);
  const racaoHojeLocal = new Set(pendHoje.map((i) => i.payload.tanque_id));
  const kgS = state.ref.kgSaco || PESO_SACO_PADRAO_KG;
  const sacos = (kg) => kg / kgS;
  // sacos: inteiro a partir de 3 (ninguém conta 6,7 sacos no galpão); abaixo disso, uma casa
  const nSacos = (n) => { const v = n >= 3 ? Math.round(n) : Math.round(n * 10) / 10; return `${fmtNum(v, Number.isInteger(v) ? 0 : 1)} ${v === 1 ? 'saco' : 'sacos'}`; };

  // ração por tanque: hoje (banco + o que ainda está no aparelho) e a média dos dias com ração na última semana
  const porTanque = {};
  const dias14 = Array.from({ length: 14 }, (_, i) => desde(13 - i));
  const porDia = Object.fromEntries(dias14.map((d) => [d, 0]));
  const t0 = (id) => (porTanque[id] ||= { hojeKg: 0, semana: {} });
  for (const r of racao || []) {
    const kg = Number(r.quantidade_kg) || 0;
    if (r.data in porDia) porDia[r.data] += kg;
    const t = t0(r.tanque_id);
    if (r.data === hoje) t.hojeKg += kg;
    else if (r.data >= desde(7)) t.semana[r.data] = (t.semana[r.data] || 0) + kg;
  }
  for (const i of pendHoje) { const kg = Number(i.payload.quantidade_kg) || 0; t0(i.payload.tanque_id).hojeKg += kg; porDia[hoje] += kg; }
  const mediaKg = (id) => { const s = Object.values((porTanque[id] || {}).semana || {}); return s.length ? s.reduce((a, b) => a + b, 0) / s.length : null; };

  const status = {};
  for (const t of tanques) status[t.id] = statusTanque(t, lotes, resumo, racaoHojeLocal, hoje);
  const grupo = (k) => tanques.filter((t) => status[t.id] === k).sort(ordemNatural);
  const faltam = grupo('falta'), feitos = grupo('ok'), vazios = grupo('semlote');
  const dadoKg = feitos.reduce((s, t) => s + ((porTanque[t.id] || {}).hojeKg || 0), 0);
  const previstoFaltaKg = faltam.reduce((s, t) => s + (mediaKg(t.id) || 0), 0);
  const temMedia = faltam.every((t) => mediaKg(t.id) != null);

  const fase = (t) => { const ls = lotes.filter((l) => l.tanque_id === t.id); return ls.length > 1 ? `${ls.length} lotes` : ls.length ? ROTULO_TIPO[ls[0].tipo] || ls[0].tipo : 'Sem lote'; };
  const visto = icone('check', 16);
  const tile = (t) => {
    if (status[t.id] === 'falta') {
      const m = mediaKg(t.id);
      return `<a class="tq falta" href="#/lancar?tipo=racao&tanque=${esc(t.id)}"><b>${esc(t.nome)}</b><span class="tq-fase">${esc(fase(t))}</span>
        <span class="tq-acao">${m ? `Lançar ${esc(nSacos(sacos(m)))}` : 'Lançar ração'}</span></a>`;
    }
    if (status[t.id] === 'ok') {
      const kg = (porTanque[t.id] || {}).hojeKg;
      return `<a class="tq pronto" href="#/t/${esc(t.id)}"><b>${esc(t.nome)}</b><span class="tq-fase">${esc(fase(t))}</span>
        <span class="tq-ok">${visto}${kg ? esc(nSacos(sacos(kg))) : 'Alimentado'}</span></a>`;
    }
    return `<a class="tq vazio" href="#/t/${esc(t.id)}"><b>${esc(t.nome)}</b><span class="tq-fase">Sem lote</span></a>`;
  };

  const comLote = faltam.length + feitos.length;
  const achado = !comLote ? 'Nenhum tanque com lote ativo.'
    : faltam.length ? `<b>${fmtInt(faltam.length)} ${faltam.length === 1 ? 'tanque' : 'tanques'}</b> ainda sem ração`
    : '<b>Todos os tanques</b> já comeram hoje';
  const dataLonga = new Date(`${hoje}T12:00:00`).toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });

  el.innerHTML = `
    <div class="h-titulo">
      <div><h1>Hoje na fazenda</h1>
        <p class="h-achado">${esc(dataLonga.charAt(0).toUpperCase() + dataLonga.slice(1))} · ${achado}</p></div>
      ${faltam.length ? `<a class="btn primario" href="#/lancar?tipo=racao&tanque=${esc(faltam[0].id)}">${icone('lancar', 20)}Lançar ração</a>` : ''}
    </div>
    <div id="avisos">${avisoContagem(ctx, saldoRacao, hoje)}</div>
    ${semDetalhe ? '<p class="aviso">Sem conexão: mostrando só o que está guardado no aparelho. Os totais aparecem quando houver internet.</p>' : ''}
    <div class="h-grade">
      <div class="h-col">
        ${blocoRacao()}
        ${gerir ? blocoMortes() : ''}
      </div>
      <div class="h-col">
        ${gerir ? blocoPeixe() : ''}
        ${blocoEstoque()}
      </div>
    </div>`;
  const bn = el.querySelector('#b-novo-tanque'); if (bn) bn.addEventListener('click', () => novoTanque(ctx, el));
  avisoPlano(ctx, el.querySelector('#avisos'));

  function blocoRacao() {
    const previsto = dadoKg + previstoFaltaKg;
    const lead = !comLote ? ''
      : temMedia && previsto > 0 && faltam.length
        ? `<p class="h-lead"><span class="h-num">${fmtNum(sacos(dadoKg), 0)}</span><span class="h-de">de ${esc(nSacos(sacos(previsto)))}</span></p>
           <div class="h-trilho" role="img" aria-label="${fmtNum(sacos(dadoKg), 0)} de ${fmtNum(sacos(previsto), 0)} sacos dados hoje"><span style="width:${Math.min(100, (dadoKg / previsto) * 100).toFixed(1)}%"></span></div>
           <p class="h-trilho-leg"><span>${fmtNum(dadoKg, 0)} kg dados</span><span>faltam ${esc(nSacos(sacos(previstoFaltaKg)))}</span></p>`
        : `<p class="h-lead"><span class="h-num">${fmtNum(sacos(dadoKg), dadoKg && dadoKg / kgS < 10 ? 1 : 0)}</span><span class="h-de">${Math.abs(sacos(dadoKg) - 1) < 0.05 ? 'saco dado' : 'sacos dados'} hoje</span></p>`;
    return `<section class="h-bloco" aria-labelledby="h-racao">
      <header><h2 id="h-racao">Ração de hoje</h2>${temMedia && faltam.length ? '<span class="h-meta">o que falta, pela média da semana</span>' : ''}</header>
      ${lead}
      <div class="mapa" aria-label="Tanques">${[...faltam, ...feitos, ...vazios].map(tile).join('')}
        ${gerir ? `<button class="tq novo" id="b-novo-tanque" type="button">${icone('lancar', 20)}<b>Novo tanque</b></button>` : ''}</div>
    </section>`;
  }

  function blocoPeixe() {
    let peixes = 0, kg = 0; const porT = {};
    for (const l of lotes) {
      const r = resumo[l.id];
      const vivos = Math.max(0, Number(l.quantidade_inicial) - Number((r && r.mortos) || 0));
      const pm = r && r.ultimo_peso_medio_kg != null ? Number(r.ultimo_peso_medio_kg) : Number(l.peso_inicial_kg) / Math.max(1, Number(l.quantidade_inicial));
      const b = vivos * (pm || 0);
      peixes += vivos; kg += b; porT[l.tanque_id] = (porT[l.tanque_id] || 0) + b;
    }
    if (!lotes.length || semDetalhe) return '';
    const preco = state.ref.precoKg;
    const top = tanques.filter((t) => porT[t.id] > 0).sort((a, b) => porT[b.id] - porT[a.id]).slice(0, 4);
    const t = kg >= 1000;
    return `<section class="h-bloco" aria-labelledby="h-peixe">
      <header><h2 id="h-peixe">Peixe na água</h2><span class="h-meta">${fmtInt(comLote)} ${comLote === 1 ? 'tanque' : 'tanques'} com lote</span></header>
      <p class="h-lead"><span class="h-num">${fmtNum(t ? kg / 1000 : kg, t ? 1 : 0)}</span><span class="h-de">${t ? 'toneladas estimadas' : 'kg estimados'}</span></p>
      <dl class="h-pares">
        <div><dt>Peixes vivos</dt><dd>${fmtInt(peixes)}</dd></div>
        ${state.perfil.papel === 'dono' ? (preco
          ? `<div><dt>Valor estimado</dt><dd>${esc(valorCurto(kg * preco))}</dd></div><div><dt>Preço usado</dt><dd>R$ ${fmtNum(preco, 2)}/kg</dd></div>`
          : '<div><dt>Valor estimado</dt><dd><a href="#/mais">Informar preço do kg</a></dd></div>') : ''}
      </dl>
      ${top.length > 1 ? `<ul class="h-barras">${top.map((x) => `<li><span>${esc(x.nome)}</span><b>${t ? fmtNum(porT[x.id] / 1000, 1) + ' t' : fmtNum(porT[x.id], 0) + ' kg'}</b><i style="width:${((porT[x.id] / porT[top[0].id]) * 100).toFixed(1)}%"></i></li>`).join('')}</ul>` : ''}
    </section>`;
  }

  function blocoEstoque() {
    if (!saldoRacao) return '';
    const saldo = Number(saldoRacao.saldo_kg) || 0;
    const sit = situacaoEstoque(saldo, saldoRacao.consumo_7d_kg, ESTOQUE_ATENCAO_DIAS, ESTOQUE_CRITICO_DIAS);
    let nota = '';
    if (sit.nivel === 'negativo') nota = '<p class="h-alerta">O saldo ficou negativo: confira o estoque no galpão.</p>';
    else if (sit.dias != null) {
      const fim = new Date(`${hoje}T12:00:00`); fim.setDate(fim.getDate() + Math.floor(sit.dias));
      const quando = fim.toLocaleDateString('pt-BR', { day: 'numeric', month: 'long' });
      const txt = `No ritmo de ${esc(nSacos(sacos(sit.porDia)))} por dia, acaba em <b>${esc(quando)}</b>.`;
      nota = sit.nivel === 'ok' ? `<p class="h-nota">${txt}</p>` : `<p class="${sit.nivel === 'critico' ? 'h-alerta' : 'aviso'}">${txt} Hora de comprar.</p>`;
    } else nota = '<p class="h-nota">Sem consumo na última semana para estimar a duração.</p>';
    const dur = sit.dias != null ? ` · dura ${fmtInt(Math.floor(sit.dias))} ${Math.floor(sit.dias) === 1 ? 'dia' : 'dias'}` : '';
    const temDias = racao && dias14.some((d) => porDia[d] > 0);
    return `<section class="h-bloco" aria-labelledby="h-est">
      <header><h2 id="h-est"><a href="#/estoque" style="color:inherit;text-decoration:none">Estoque de ração</a></h2><span class="h-meta">no galpão</span></header>
      <p class="h-lead"><span class="h-num">${saldo < 0 ? '−' : ''}${fmtNum(Math.abs(sacos(saldo)), 0)}</span><span class="h-de">sacos${dur}</span></p>
      ${nota}
      ${temDias ? `<div class="h-graf">${barras14()}</div><p class="h-graf-leg">Sacos dados por dia nos últimos 14 dias. Hoje, em verde, ainda em andamento.</p>` : ''}
    </section>`;
  }

  function barras14() {
    const vals = dias14.map((d) => sacos(porDia[d]));
    const W = 320, H = 120, pl = 22, pr = 2, pt = 6, pb = 18;
    const passo = [1, 2, 5, 10, 20, 25, 50, 100, 200, 500].find((p) => Math.max(...vals) / p <= 3) || 1000;
    const topo = Math.max(passo, Math.ceil(Math.max(...vals) / passo) * passo + (Math.max(...vals) % passo === 0 ? passo : 0));
    const y = (v) => pt + (H - pt - pb) * (1 - v / topo);
    const larg = (W - pl - pr) / vals.length;
    const grade = []; for (let v = 0; v <= topo; v += passo) grade.push(`<line class="grade-y" x1="${pl}" x2="${W - pr}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}"/><text x="${pl - 4}" y="${(y(v) + 3).toFixed(1)}" text-anchor="end">${fmtInt(v)}</text>`);
    const bs = vals.map((v, i) => {
      const x = pl + i * larg + larg * 0.16, w = larg * 0.68, h = (H - pt - pb) * (v / topo);
      const [, m, d] = dias14[i].split('-');
      const rot = i === 0 || i === 7 || i === 13 ? `<text x="${(i === 0 ? x : i === 13 ? x + w : x + w / 2).toFixed(1)}" y="${H - 4}" text-anchor="${i === 0 ? 'start' : i === 13 ? 'end' : 'middle'}">${d}/${m}</text>` : '';
      return `<rect class="barra ${i === 13 ? 'hoje' : 'cinza'}" x="${x.toFixed(1)}" y="${(H - pb - h).toFixed(1)}" width="${w.toFixed(1)}" height="${Math.max(h, v > 0 ? 1.5 : 0).toFixed(1)}" rx="1.5"><title>${d}/${m}: ${fmtNum(v, 1)} sacos</title></rect>${rot}`;
    }).join('');
    return `<svg class="grafico" viewBox="0 0 ${W} ${H}" role="img" aria-label="Sacos de ração dados por dia nos últimos 14 dias">${grade.join('')}${bs}</svg>`;
  }

  function blocoMortes() {
    if (!mortes) return '';
    const loteTanque = Object.fromEntries(lotes.map((l) => [l.id, l.tanque_id]));
    const porT = {}, causas = {};
    let total = 0;
    for (const m of mortes) {
      const tq = loteTanque[m.lote_id]; if (!tq) continue; // lote encerrado: fora do resumo dos tanques ativos
      const q = Number(m.quantidade) || 0;
      total += q; porT[tq] = (porT[tq] || 0) + q;
      if (m.causa) (causas[tq] ||= {})[m.causa] = ((causas[tq] || {})[m.causa] || 0) + q;
    }
    let vivos = 0;
    for (const l of lotes) vivos += Math.max(0, Number(l.quantidade_inicial) - Number((resumo[l.id] && resumo[l.id].mortos) || 0));
    const ids = Object.keys(porT).sort((a, b) => porT[b] - porT[a]);
    const pior = ids[0];
    const outros = Math.max(1, comLote - 1);
    const mediaOutros = pior ? (total - porT[pior]) / outros : 0;
    const fora = pior && porT[pior] >= 10 && porT[pior] >= 3 * Math.max(mediaOutros, 1);
    const nomeT = (id) => (tanques.find((t) => t.id === id) || {}).nome || 'Tanque';
    const causaPior = pior && causas[pior] ? Object.entries(causas[pior]).sort((a, b) => b[1] - a[1])[0][0] : '';
    const pct = vivos + total > 0 ? (total / (vivos + total)) * 100 : 0;
    return `<section class="h-bloco" aria-labelledby="h-morte">
      <header><h2 id="h-morte">Mortalidade</h2><span class="h-meta">últimos 7 dias</span></header>
      <p class="h-lead"><span class="h-num">${fmtInt(total)}</span><span class="h-de">${total === 1 ? 'peixe' : 'peixes'}${total ? ` · ${fmtNum(pct, 2)}% do plantel` : ''}</span></p>
      ${fora
        ? `<p class="h-alerta"><b>${esc(nomeT(pior))}: ${fmtInt(porT[pior])} peixes</b>${causaPior ? ` (${esc(causaPior.toLowerCase())})` : ''}${mediaOutros >= 1 ? `, ${fmtNum(porT[pior] / mediaOutros, 0)}× a média dos outros tanques` : ', acima dos outros tanques'}.</p>`
        : `<p class="h-calmo">${total ? 'Nenhum tanque fora do normal.' : 'Nenhuma morte lançada na semana.'}</p>`}
    </section>`;
  }
}

// valor em reais, curto: R$ 1,06 mi · R$ 380 mil · R$ 12.400
function valorCurto(v) {
  if (v >= 1e6) return `R$ ${fmtNum(v / 1e6, 2)} mi`;
  if (v >= 1e5) return `R$ ${fmtNum(v / 1e3, 0)} mil`;
  return `R$ ${fmtNum(v, 0)}`;
}

// lembrete de contagem semanal (dono/gerente), só quando a ração está sendo usada
function avisoContagem(ctx, saldo, hoje) {
  if (!ctx.podeGerir() || !saldo || !(Number(saldo.consumo_7d_kg) > 0) || saldo.ultima_contagem === undefined) return '';
  const dias = saldo.ultima_contagem ? diasEntre(saldo.ultima_contagem, hoje) : null;
  if (dias != null && dias < CONTAGEM_LEMBRETE_DIAS) return '';
  return `<a class="aviso aviso-link" href="#/estoque" id="aviso-contagem">${dias == null ? 'O estoque de ração ainda não foi contado.' : `Faz ${fmtInt(dias)} dias sem contar o estoque de ração.`} Toque para contar: deixa o saldo confiável.</a>`;
}

// aviso de teste/plano perto de vencer ou vencido (só o dono)
async function avisoPlano(ctx, caixa) {
  if (!caixa || ctx.state.perfil.papel !== 'dono' || !navigator.onLine) return;
  const p = await ctx.api.plano().catch(() => null);
  if (!p || !caixa.isConnected) return;
  const dias = p.valido_ate ? diasEntre(hojeISO(), p.valido_ate) : null;
  const quando = dias === 0 ? 'hoje' : dias === 1 ? 'amanhã' : `em ${fmtInt(dias)} dias (${fmtData(p.valido_ate)})`;
  const txt = p.estado === 'teste' && dias != null && dias <= PLANO_AVISO_DIAS ? `Seu teste grátis termina ${quando}. Escolha um pacote para continuar abrindo lotes.`
    : p.estado === 'ativo' && dias != null && dias <= PLANO_AVISO_DIAS ? `Seu plano vence ${quando}. Renove para continuar abrindo lotes.`
    : p.estado === 'carencia' ? `Seu plano venceu em ${fmtData(p.valido_ate)}. Renove logo: depois da carência, não dá para abrir lotes novos.`
    : p.estado === 'vencido' || p.estado === 'teste_acabou' ? 'Seu plano está vencido: não dá para abrir lotes novos. Os lançamentos continuam funcionando.'
    : '';
  if (txt) caixa.insertAdjacentHTML('afterbegin', `<a class="aviso aviso-link" href="#/plano" id="aviso-plano">${esc(txt)} <b>Ver plano</b></a>`);
}
