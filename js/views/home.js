import { esc, fmtInt, fmtNum, fmtData, hojeISO, diasEntre, num, ROTULO_TIPO, progresso, fmtPct } from '../util.js';
import * as db from '../db.js';
import { situacaoEstoque, previsaoDespesca, alertasManejo, sugestaoRacao } from '../calc.js';
import { ESTOQUE_ATENCAO_DIAS, ESTOQUE_CRITICO_DIAS, ESTOQUE_COBERTURA_DIAS, PESO_SACO_PADRAO_KG, CONTAGEM_LEMBRETE_DIAS, PLANO_AVISO_DIAS, ALERTAS, TAXA_RACAO } from '../config.js';
import { icone } from '../icons.js';
import { pedirTexto } from '../dialogo.js';
import { pizza, COR_FASE, ORDEM_FASE, COR_RACAO } from '../graficos.js';
import { metaDe, pesoTxt, htmlPrevisao } from './despesca.js';
import { pintarTempo } from './tempo.js';
export { renderTanqueDetalhe } from './tanque-detalhe.js';

export const ordemNatural = (a, b) => String(a.nome).localeCompare(String(b.nome), 'pt-BR', { numeric: true, sensitivity: 'base' });

export function statusTanque(tanque, lotes, resumo, racaoHojeLocal, hoje) {
  const meus = lotes.filter((l) => l.tanque_id === tanque.id);
  if (!meus.length) return 'semlote';
  const lancou = racaoHojeLocal.has(tanque.id) || meus.some((l) => resumo[l.id] && resumo[l.id].ultima_racao === hoje);
  return lancou ? 'ok' : 'falta';
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
  let semDetalhe = false, saldos = null, racao = null, mortes = null;
  if (navigator.onLine) {
    const [rs, sd, rc, mt] = await Promise.all([
      ctx.api.resumoLotes().catch(() => null),
      ctx.api.saldosRacao().catch(() => null),
      ctx.api.racaoPeriodo(desde(13)).catch(() => null), // 14 dias: hoje e os 13 anteriores
      gerir ? ctx.api.mortalidadePeriodo(desde(6)).catch(() => null) : null, // 7 dias com hoje
    ]);
    if (rs) for (const r of rs) resumo[r.lote_id] = r; else semDetalhe = true;
    saldos = sd; racao = rc; mortes = mt;
  } else { semDetalhe = true; }
  // a ração de alevino só aparece na Início quando a fazenda usa (tem saldo, compra ou consumo)
  const usadas = saldos ? saldos.linhas.filter((s, i) => i === 0 || ['total_comprado_kg', 'total_consumido_kg', 'saldo_kg'].some((k) => Number(s[k]))) : [];
  // lembrete de contagem: a ração em uso há mais tempo sem contar
  const paraContar = usadas.filter((s) => Number(s.consumo_7d_kg) > 0).sort((a, b) => String(a.ultima_contagem || '').localeCompare(String(b.ultima_contagem || '')))[0] || usadas[0] || null;

  const fila = await db.filaList();
  const metas = (await db.kvGet('metasDespesca')) || {};
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
  // linha de números do quadro: toneladas na água e peso médio ÷ meta de despesca (só com um lote no tanque)
  const linhaTq = (t) => {
    const ls = lotes.filter((l) => l.tanque_id === t.id);
    if (!ls.length || semDetalhe) return '';
    let bio = 0;
    for (const l of ls) {
      const r = resumo[l.id];
      const v = Math.max(0, Number(l.quantidade_inicial) - Number((r && r.mortos) || 0));
      const pm = r && r.ultimo_peso_medio_kg != null ? Number(r.ultimo_peso_medio_kg) : Number(l.peso_inicial_kg) / Math.max(1, Number(l.quantidade_inicial));
      bio += v * (pm || 0);
    }
    const bioTxt = bio >= 1000 ? `${fmtNum(bio / 1000, 1)} t` : `${fmtNum(bio, 0)} kg`;
    if (ls.length > 1) return `<span class="tq-dado"><span>${bioTxt}</span></span>`;
    const l = ls[0], r = resumo[l.id];
    const pm = r && r.ultimo_peso_medio_kg != null ? Number(r.ultimo_peso_medio_kg) : Number(l.peso_inicial_kg) / Math.max(1, Number(l.quantidade_inicial));
    const meta = metaDe(l, metas);
    return `<span class="tq-dado"><span>${bioTxt}</span><strong>${pesoTxt(pm)}<span> / ${pesoTxt(meta)}</span></strong></span>${progresso((pm / meta) * 100, { fina: true, tom: pm >= meta ? 'ok' : '', rotulo: `Peso médio ${pesoTxt(pm)} de ${pesoTxt(meta)}` })}`;
  };
  // sugestão do dia (só quando o tanque ainda não tem média de ração na semana)
  const sugDe = (t) => (semDetalhe ? null : sugestaoRacao(lotes.filter((l) => l.tanque_id === t.id), resumo, TAXA_RACAO));
  const tile = (t) => {
    if (status[t.id] === 'falta') {
      const m = mediaKg(t.id);
      return `<a class="tq falta" href="#/lancar?tipo=racao&tanque=${esc(t.id)}"><b>${esc(t.nome)}</b><span class="tq-fase">${esc(fase(t))}</span>
        ${linhaTq(t)}<span class="tq-acao">${m ? `<span class="tq-verbo">Lançar </span><span class="tq-mais">+</span>${esc(nSacos(sacos(m)))}` : sugDe(t) ? `<span class="tq-verbo">Lançar </span><span class="tq-mais">+</span>~${esc(nSacos(sacos(sugDe(t).kg)))}` : 'Lançar ração'}</span></a>`;
    }
    if (status[t.id] === 'ok') {
      const kg = (porTanque[t.id] || {}).hojeKg;
      return `<a class="tq pronto" href="#/t/${esc(t.id)}"><b>${esc(t.nome)}</b><span class="tq-fase">${esc(fase(t))}</span>
        ${linhaTq(t)}<span class="tq-ok">${visto}${kg ? esc(nSacos(sacos(kg))) : 'Alimentado'}</span></a>`;
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
    </div>
    <div id="avisos">${avisoContagem(ctx, paraContar, hoje)}</div>
    ${semDetalhe ? '<p class="aviso">Sem conexão: mostrando só o que está guardado no aparelho. Os totais aparecem quando houver internet.</p>' : ''}
    ${comLote ? `<div class="h-topo">${cartaoAgora()}${painelKpis()}</div>` : ''}
    ${gerir ? blocoAlertas() : ''}
    <div class="h-grade">
      <div class="h-col">
        ${blocoRacao()}
        ${gerir ? blocoMortes() : ''}
      </div>
      <div class="h-col">
        <section class="h-bloco" aria-labelledby="h-tempo" id="b-tempo"><header><h2 id="h-tempo">Tempo na fazenda</h2></header><p class="h-calmo">Carregando a previsão…</p></section>
        ${gerir ? blocoDespescas() : ''}
        ${blocoEstoque()}
        ${gerir ? blocoPeixe() : ''}
      </div>
    </div>`;
  const bn = el.querySelector('#b-novo-tanque'); if (bn) bn.addEventListener('click', () => novoTanque(ctx, el));
  avisoPlano(ctx, el.querySelector('#avisos'));
  pintarTempo(el.querySelector('#b-tempo'), ctx, hoje);

  // alertas de manejo: biometria vencida, ração fora da média, mortes repetidas (dono/gerente)
  function blocoAlertas() {
    if (semDetalhe) return '';
    const racaoHoje = {}, mediaSemana = {};
    for (const t of tanques) {
      const kg = (porTanque[t.id] || {}).hojeKg; if (kg) racaoHoje[t.id] = kg;
      const m = mediaKg(t.id); if (m) mediaSemana[t.id] = m;
    }
    const als = alertasManejo({ lotes, resumo, racaoHoje, mediaSemana, mortes: mortes || [], hoje, cfg: ALERTAS });
    if (!als.length) return '';
    const nomeT = (id) => (tanques.find((t) => t.id === id) || {}).nome || 'Tanque';
    const lista = (itens, f) => { const n = itens.slice(0, 3).map(f).join(', '); return itens.length > 3 ? `${n} e mais ${itens.length - 3}` : n; };
    const linhas = als.map((a) => {
      if (a.tipo === 'biometria') {
        const p = a.itens[0];
        return `<li class="al-bio"><div><b>${a.itens.length === 1 ? 'Biometria atrasada' : `${fmtInt(a.itens.length)} tanques sem biometria recente`}</b>
          <span>${esc(lista(a.itens, (x) => `${nomeT(x.tanque)} (${fmtInt(x.dias)} dias)`))}. Sem pesagem, peso, biomassa e previsão de despesca ficam desatualizados.</span></div>
          <a class="btn mini" href="#/lancar?tipo=biometria&tanque=${esc(p.tanque)}">Pesar ${esc(nomeT(p.tanque))}</a></li>`;
      }
      if (a.tipo === 'racao') {
        return `<li class="al-racao"><div><b>Ração fora da média hoje</b>
          <span>${esc(lista(a.itens, (x) => `${nomeT(x.tanque)}: ${fmtNum(x.kg, 0)} kg, ${x.desvio > 0 ? '+' : '−'}${fmtInt(Math.abs(x.desvio) * 100)}% da média`))}. Confira se o lançamento está certo ou se o peixe mudou de apetite.</span></div>
          <a class="btn mini" href="#/relatorio/racao">Ver ração</a></li>`;
      }
      const p = a.itens[0];
      return `<li class="al-morte"><div><b>Mortes ${a.itens.length === 1 ? `no ${esc(nomeT(p.tanque))}` : 'repetidas'} há ${fmtInt(p.dias)} dias seguidos</b>
        <span>${esc(lista(a.itens, (x) => `${nomeT(x.tanque)}: ${fmtInt(x.total)} peixes em ${fmtInt(x.dias)} dias`))}. Verifique oxigênio, sobra de ração e sinais de doença.</span></div>
        <a class="btn mini" href="#/t/${esc(p.tanque)}">Abrir tanque</a></li>`;
    }).join('');
    return `<section class="h-alertas" aria-labelledby="h-at"><h2 id="h-at">Atenção</h2><ul>${linhas}</ul></section>`;
  }

  function cartaoAgora() {
    const pct = comLote ? feitos.length / comLote : 0;
    const C = 2 * Math.PI * 54;
    const anel = `<div class="ag-anel" role="img" aria-label="${feitos.length} de ${comLote} tanques alimentados hoje"><svg viewBox="0 0 120 120"><circle cx="60" cy="60" r="54" class="ag-trilho"/><circle cx="60" cy="60" r="54" class="ag-feito${pct >= 1 ? ' cheio' : ''}" stroke-dasharray="${C.toFixed(1)}" stroke-dashoffset="${(C * (1 - pct)).toFixed(1)}"/></svg>
      <div><b>${fmtInt(feitos.length)}/${fmtInt(comLote)}</b><small>tanques<br>alimentados</small></div></div>`;
    const dado = dadoKg > 0 ? ` · ${esc(nSacos(sacos(dadoKg)))} dados hoje` : '';
    if (!faltam.length) {
      return `<section class="ag ok">${anel}<div class="ag-txt"><span class="ag-rot">Ração de hoje</span><h2>Todos os tanques comeram</h2><p>Bom trabalho${dado}.</p>
        ${gerir ? '<a class="btn" href="#/relatorio/racao">Ver ração de hoje</a>' : ''}</div></section>`;
    }
    const t = faltam[0], m = mediaKg(t.id);
    const ls = lotes.filter((l) => l.tanque_id === t.id);
    const peixes = ls.reduce((a, l) => a + Math.max(0, Number(l.quantidade_inicial) - Number((resumo[l.id] && resumo[l.id].mortos) || 0)), 0);
    const sg = m ? null : sugDe(t);
    const det = [fase(t), peixes ? `${fmtInt(peixes)} peixes` : '', m ? `média de ${nSacos(sacos(m))}` : sg ? `sugestão de ~${nSacos(sacos(sg.kg))} (${fmtNum(sg.pct, 1)}% do peso vivo${sg.provisoria ? ', provisória' : ''})` : 'sem média ainda: conte os sacos dados'].filter(Boolean).join(' · ');
    return `<section class="ag">${anel}<div class="ag-txt"><span class="ag-rot">Próxima tarefa</span><h2>Ração no ${esc(t.nome)}</h2><p>${esc(det)}${dado}</p>
      <a class="btn primario grande" href="#/lancar?tipo=racao&tanque=${esc(t.id)}">Lançar ração agora</a></div></section>`;
  }

  function painelKpis() {
    const ks = [];
    if (gerir && !semDetalhe) {
      let peixes = 0, kg = 0, ini = 0;
      for (const l of lotes) {
        const r = resumo[l.id];
        const v = Math.max(0, Number(l.quantidade_inicial) - Number((r && r.mortos) || 0));
        const pm = r && r.ultimo_peso_medio_kg != null ? Number(r.ultimo_peso_medio_kg) : Number(l.peso_inicial_kg) / Math.max(1, Number(l.quantidade_inicial));
        peixes += v; kg += v * (pm || 0); ini += Number(l.quantidade_inicial) || 0;
      }
      const sob = ini > 0 ? (peixes / ini) * 100 : 100;
      ks.push(`<div class="kp"><span>Peixe na água</span><b>${kg >= 1000 ? fmtNum(kg / 1000, 1) : fmtNum(kg, 0)}<em>${kg >= 1000 ? 't' : 'kg'}</em></b><small>${fmtInt(peixes)} peixes vivos</small></div>`);
      ks.push(`<div class="kp"><span>Sobrevivência</span><b>${fmtPct(sob)}<em>%</em></b>${progresso(sob, { fina: true, tom: sob >= 90 ? 'ok' : sob >= 75 ? 'alerta' : 'erro', rotulo: `Sobrevivência ${fmtPct(sob)}%` })}<small>desde a entrada dos lotes</small></div>`);
    } else {
      ks.push(`<div class="kp"><span>Ração dada hoje</span><b>${fmtNum(sacos(dadoKg), 0)}<em>${Math.round(sacos(dadoKg)) === 1 ? 'saco' : 'sacos'}</em></b><small>${fmtNum(dadoKg, 0)} kg</small></div>`);
    }
    if (usadas.length) {
      const tot = usadas.reduce((a, x) => a + Math.max(0, Number(x.saldo_kg) || 0), 0);
      const sit = situacaoEstoque(Number(usadas[0].saldo_kg) || 0, usadas[0].consumo_7d_kg, ESTOQUE_ATENCAO_DIAS, ESTOQUE_CRITICO_DIAS);
      const tom = { atencao: 'alerta', critico: 'erro', negativo: 'erro' }[sit.nivel] || '';
      ks.push(`<a class="kp" href="#/estoque"><span>Estoque de ração</span><b>${fmtNum(sacos(tot), 0)}<em>sacos</em></b>${sit.dias != null ? `${progresso((sit.dias / ESTOQUE_COBERTURA_DIAS) * 100, { fina: true, tom, rotulo: `Dura ${fmtInt(Math.floor(sit.dias))} dias` })}<small>dura ~${fmtInt(Math.floor(sit.dias))} dias${usadas.length > 1 ? ' (engorda)' : ''}</small>` : '<small>sem consumo na semana para estimar</small>'}</a>`);
    }
    return `<div class="h-kpis">${ks.join('')}</div>`;
  }

  function blocoDespescas() {
    if (semDetalhe || !lotes.length) return '';
    const nomeT = (id) => (tanques.find((t) => t.id === id) || {}).nome || 'Tanque';
    const ps = lotes.map((l) => ({ l, p: previsaoDespesca(l, resumo[l.id], metaDe(l, metas), hoje) }));
    const ordem = { pronto: 0, previsto: 1, 'sem-dado': 2 };
    const comData = ps.filter((x) => x.p.estado !== 'sem-dado').sort((a, b) => ordem[a.p.estado] - ordem[b.p.estado] || String(a.p.data).localeCompare(String(b.p.data)));
    const sem = ps.length - comData.length;
    return `<section class="h-bloco" aria-labelledby="h-desp">
      <header><h2 id="h-desp">Próximas despescas</h2><span class="h-meta">pelo crescimento</span></header>
      ${comData.length ? `<ul class="h-desp">${comData.slice(0, 6).map(({ l, p }) => `<li><a href="#/t/${esc(l.tanque_id)}"><b>${esc(nomeT(l.tanque_id))}</b><span>${esc(ROTULO_TIPO[l.tipo] || l.tipo)}</span></a>${htmlPrevisao(p)}</li>`).join('')}</ul>` : ''}
      ${sem ? `<p class="h-calmo">${comData.length ? `Mais ${fmtInt(sem)}` : fmtInt(sem)} ${sem === 1 ? 'lote' : 'lotes'} sem biometria depois da entrada: lance uma pesagem para prever a despesca.</p>` : ''}
    </section>`;
  }


  function blocoRacao() {
    const previsto = dadoKg + previstoFaltaKg;
    const lead = !comLote ? ''
      : temMedia && previsto > 0 && faltam.length
        ? `<p class="h-lead"><span class="h-num">${fmtNum(sacos(dadoKg), 0)}</span><span class="h-de">de ${esc(nSacos(sacos(previsto)))}</span></p>
           <div class="h-trilho" role="img" aria-label="${fmtNum(sacos(dadoKg), 0)} de ${fmtNum(sacos(previsto), 0)} sacos dados hoje"><span style="width:${Math.min(100, (dadoKg / previsto) * 100).toFixed(1)}%"></span></div>
           <p class="h-trilho-leg"><span>${fmtNum(dadoKg, 0)} kg dados</span><span>faltam ${esc(nSacos(sacos(previstoFaltaKg)))}</span></p>`
        : `<p class="h-lead"><span class="h-num">${fmtNum(sacos(dadoKg), dadoKg && dadoKg / kgS < 10 ? 1 : 0)}</span><span class="h-de">${Math.abs(sacos(dadoKg) - 1) < 0.05 ? 'saco dado' : 'sacos dados'} hoje</span></p>`;
    return `<section class="h-bloco" aria-labelledby="h-racao">
      <header><h2 id="h-racao">Tanques</h2><span class="h-meta">${gerir && !semDetalhe ? 'peso médio ÷ meta de despesca' : 'ração de hoje'}</span></header>
      ${comLote ? '' : lead}
      <div class="mapa" aria-label="Tanques">${[...faltam, ...feitos, ...vazios].map(tile).join('')}
        ${gerir ? `<button class="tq novo" id="b-novo-tanque" type="button">${icone('lancar', 20)}<b>Novo tanque</b></button>` : ''}</div>
    </section>`;
  }

  function blocoPeixe() {
    let peixes = 0, kg = 0; const porT = {}, porFase = {};
    for (const l of lotes) {
      const r = resumo[l.id];
      const vivos = Math.max(0, Number(l.quantidade_inicial) - Number((r && r.mortos) || 0));
      const pm = r && r.ultimo_peso_medio_kg != null ? Number(r.ultimo_peso_medio_kg) : Number(l.peso_inicial_kg) / Math.max(1, Number(l.quantidade_inicial));
      const b = vivos * (pm || 0);
      peixes += vivos; kg += b; porT[l.tanque_id] = (porT[l.tanque_id] || 0) + b;
      porFase[l.tipo] = (porFase[l.tipo] || 0) + b;
    }
    if (!lotes.length || semDetalhe) return '';
    const preco = state.ref.precoKg;
    const top = tanques.filter((t) => porT[t.id] > 0).sort((a, b) => porT[b.id] - porT[a.id]).slice(0, 4);
    const t = kg >= 1000;
    return `<section class="h-bloco" aria-labelledby="h-peixe">
      <header><h2 id="h-peixe">Peixe na água</h2><span class="h-meta">${fmtInt(comLote)} ${comLote === 1 ? 'tanque' : 'tanques'} com lote</span></header>
      <dl class="h-pares">
        ${state.perfil.papel === 'dono' ? (preco
          ? `<div><dt>Valor estimado</dt><dd>${esc(valorCurto(kg * preco))}</dd></div><div><dt>Preço usado</dt><dd>R$ ${fmtNum(preco, 2)}/kg</dd></div>`
          : '<div><dt>Valor estimado</dt><dd><a href="#/mais">Informar preço do kg</a></dd></div>') : ''}
      </dl>
      ${Object.keys(porFase).filter((f) => porFase[f] > 0).length > 1 ? pizza(ORDEM_FASE.filter((f) => porFase[f] > 0).map((f) => ({ nome: ROTULO_TIPO[f] || f, valor: porFase[f], cor: COR_FASE[f], txt: t ? fmtNum(porFase[f] / 1000, 1) + ' t' : fmtNum(porFase[f], 0) + ' kg' })), { centro: t ? fmtNum(kg / 1000, 0) + ' t' : fmtNum(kg, 0) + ' kg', sub: 'por fase', rotulo: 'Peixe na água por fase' }) : ''}
      ${top.length > 1 ? `<ul class="h-barras">${top.map((x) => `<li><span>${esc(x.nome)}</span><b>${t ? fmtNum(porT[x.id] / 1000, 1) + ' t' : fmtNum(porT[x.id], 0) + ' kg'}</b><i style="width:${((porT[x.id] / porT[top[0].id]) * 100).toFixed(1)}%"></i></li>`).join('')}</ul>` : ''}
    </section>`;
  }

  function linhaEstoque(s, titulo) {
    const saldo = Number(s.saldo_kg) || 0;
    const sit = situacaoEstoque(saldo, s.consumo_7d_kg, ESTOQUE_ATENCAO_DIAS, ESTOQUE_CRITICO_DIAS);
    let nota = '';
    if (sit.nivel === 'negativo') nota = '<p class="h-alerta">O saldo ficou negativo: confira o estoque no galpão.</p>';
    else if (sit.dias != null) {
      const fim = new Date(`${hoje}T12:00:00`); fim.setDate(fim.getDate() + Math.floor(sit.dias));
      const quando = fim.toLocaleDateString('pt-BR', { day: 'numeric', month: 'long' });
      const txt = `No ritmo de ${esc(nSacos(sacos(sit.porDia)))} por dia, acaba em <b>${esc(quando)}</b>.`;
      nota = sit.nivel === 'ok' ? `<p class="h-nota">${txt}</p>` : `<p class="${sit.nivel === 'critico' ? 'h-alerta' : 'aviso'}">${txt} Hora de comprar.</p>`;
    } else nota = '<p class="h-nota">Sem consumo na última semana para estimar a duração.</p>';
    const dur = sit.dias != null ? ` · dura ${fmtInt(Math.floor(sit.dias))} ${Math.floor(sit.dias) === 1 ? 'dia' : 'dias'}` : '';
    const tomEst = { atencao: 'alerta', critico: 'erro', negativo: 'erro' }[sit.nivel] || '';
    const barra = sit.dias != null || sit.nivel === 'negativo'
      ? `<div class="h-cobre">${progresso(((sit.dias || 0) / ESTOQUE_COBERTURA_DIAS) * 100, { tom: tomEst, rotulo: `Estoque para ${fmtInt(Math.floor(sit.dias || 0))} de ${ESTOQUE_COBERTURA_DIAS} dias` })}<p class="h-trilho-leg"><span>hoje</span><span>${ESTOQUE_COBERTURA_DIAS} dias</span></p></div>` : '';
    return `<div class="h-estoque">${titulo ? `<p class="h-sub">${esc(titulo)}</p>` : ''}
      <p class="h-lead"><span class="h-num">${saldo < 0 ? '−' : ''}${fmtNum(Math.abs(sacos(saldo)), 0)}</span><span class="h-de">sacos${dur}</span></p>
      ${barra}${nota}</div>`;
  }

  function blocoEstoque() {
    if (!usadas.length) return '';
    const duas = saldos.porTipo && usadas.length > 1;
    const temDias = racao && dias14.some((d) => porDia[d] > 0);
    return `<section class="h-bloco" aria-labelledby="h-est">
      <header><h2 id="h-est"><a href="#/estoque" style="color:inherit;text-decoration:none">Estoque de ração</a></h2><span class="h-meta">no galpão</span></header>
      ${duas ? pizza(usadas.map((s) => ({ nome: s.tipo_racao === 'alevino' ? 'Alevino' : 'Engorda', valor: Math.max(0, sacos(Number(s.saldo_kg) || 0)), cor: COR_RACAO[s.tipo_racao === 'alevino' ? 'alevino' : 'engorda'], txt: nSacos(Math.max(0, sacos(Number(s.saldo_kg) || 0))) })), { centro: fmtNum(usadas.reduce((a, s) => a + Math.max(0, sacos(Number(s.saldo_kg) || 0)), 0), 0), sub: 'sacos', rotulo: 'Estoque de ração por tipo' }) : ''}
      ${usadas.map((s) => linhaEstoque(s, duas ? (s.tipo_racao === 'alevino' ? 'Ração de alevino' : 'Ração de engorda') : '')).join('')}
      ${temDias ? `<div class="h-graf">${barras14()}</div><p class="h-graf-leg">Sacos dados por dia nos últimos 14 dias${duas ? ', somando as duas rações' : ''}. Hoje, em verde, ainda em andamento.</p>` : ''}
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
