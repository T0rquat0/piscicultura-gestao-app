import { esc, fmtInt, fmtNum, fmtData, hojeISO, diasEntre, ROTULO_TIPO } from '../util.js';
import * as db from '../db.js';

export const ordemNatural = (a, b) => String(a.nome).localeCompare(String(b.nome), 'pt-BR', { numeric: true, sensitivity: 'base' });

export function statusTanque(tanque, lotes, resumo, racaoHojeLocal, hoje) {
  const meus = lotes.filter((l) => l.tanque_id === tanque.id);
  if (!meus.length) return 'semlote';
  const lancou = racaoHojeLocal.has(tanque.id) || meus.some((l) => resumo[l.id] && resumo[l.id].ultima_racao === hoje);
  return lancou ? 'ok' : 'falta';
}

export function htmlCardTanque(tanque, lotes, resumo, racaoHojeLocal, hoje) {
  const blocos = lotes.length
    ? lotes.map((l) => {
        const r = resumo[l.id];
        const dias = diasEntre(l.data_entrada, hoje);
        const vivos = r ? Math.max(0, l.quantidade_inicial - Number(r.mortos)) : null;
        const pm = r && r.ultimo_peso_medio_kg != null ? fmtNum(r.ultimo_peso_medio_kg * 1000, 0) + '<em>g</em>' : '—';
        return `
        <div class="lote">
          <p class="lote-nome"><span class="fase ${l.tipo === 'alevinagem' ? 'alev' : 'eng'}"></span>${esc(ROTULO_TIPO[l.tipo] || l.tipo)} · ${esc(l.especie)}</p>
          <div class="destaques">
            <div><span class="mudo">Peso médio atual</span><b class="grande-num">${pm}</b>
              ${r && r.ultima_biometria ? `<small>em ${fmtData(r.ultima_biometria)}</small>` : ''}</div>
            <div><span class="mudo">Ração acumulada</span><b class="grande-num">${r ? fmtNum(r.racao_kg, 0) + '<em>kg</em>' : '—'}</b></div>
          </div>
          <div class="dados">
            <div><span class="mudo">Dias no tanque</span><b>${fmtInt(dias)}</b></div>
            <div><span class="mudo">Peixes vivos (estim.)</span><b>${fmtInt(vivos ?? l.quantidade_inicial)}</b></div>
          </div>
        </div>`;
      }).join('')
    : '<p class="mudo">Sem lote ativo neste tanque.</p>';

  const comLote = lotes.length > 0;
  const lancouHoje = lotes.some((l) => resumo[l.id] && resumo[l.id].ultima_racao === hoje) || racaoHojeLocal.has(tanque.id);
  const selo = !comLote ? '' : lancouHoje
    ? '<span class="tag ok"><i></i>Ração lançada hoje</span>'
    : '<span class="tag alerta"><i></i>Sem ração hoje</span>';

  return `
  <article class="card tanque-card ${!comLote ? 'sem-lote' : lancouHoje ? 'ok' : 'falta'}">
    <header><h3>${esc(tanque.nome)}</h3>${selo}</header>
    <div class="corpo">
    ${blocos}
    ${comLote ? `<div class="acoes">
      <a class="btn mini primario" href="#/lancar?tipo=racao&tanque=${esc(tanque.id)}">Lançar ração</a>
      <a class="btn mini" href="#/lancar?tipo=biometria&tanque=${esc(tanque.id)}">Biometria</a>
      <a class="btn mini" href="#/lancar?tipo=mortalidade&tanque=${esc(tanque.id)}">Mortalidade</a>
    </div>` : ''}
    </div>
  </article>`;
}

function resumoDia(comLote, faltam) {
  return `<section class="resumo" aria-label="Resumo do dia">
    <div><span>Tanques com lote</span><b>${fmtInt(comLote)}</b></div>
    ${faltam
      ? `<button type="button" class="atencao" data-filtrar-falta><span>Falta alimentar hoje</span><b>${fmtInt(faltam)}</b></button>`
      : '<div><span>Ração lançada hoje</span><b>Tudo certo</b></div>'}
  </section>`;
}

export async function renderHome(ctx, el) {
  const { state } = ctx;
  const primeiro = (state.perfil.nome || '').split(' ')[0];
  const { tanques, lotes } = state.ref;

  if (!tanques.length) {
    el.innerHTML = `<h1>Olá, ${esc(primeiro)}</h1>` + (ctx.podeGerir()
      ? `<div class="card vazio"><p>Nenhum tanque cadastrado ainda.</p><a class="btn primario" href="#/tanques">Cadastrar o primeiro tanque</a></div>`
      : `<div class="card vazio"><p>Nenhum tanque liberado para você ainda.<br>Peça ao gerente para liberar os seus tanques.</p></div>`);
    return;
  }

  el.innerHTML = `<h1>Olá, ${esc(primeiro)}</h1><p class="carregando">Carregando tanques…</p>`;
  const resumo = {};
  let semDetalhe = false;
  if (navigator.onLine) {
    try { for (const r of await ctx.api.resumoLotes()) resumo[r.lote_id] = r; } catch { semDetalhe = true; }
  } else { semDetalhe = true; }

  const hoje = hojeISO();
  const fila = await db.filaList();
  const racaoHojeLocal = new Set(fila.filter((i) => i.tabela === 'racao_consumo' && i.payload.data === hoje).map((i) => i.payload.tanque_id));

  const status = {};
  for (const t of tanques) status[t.id] = statusTanque(t, lotes, resumo, racaoHojeLocal, hoje);
  const grupos = {
    falta: tanques.filter((t) => status[t.id] === 'falta').sort(ordemNatural),
    ok: tanques.filter((t) => status[t.id] === 'ok').sort(ordemNatural),
    semlote: tanques.filter((t) => status[t.id] === 'semlote').sort(ordemNatural),
  };
  const card = (t) => htmlCardTanque(t, lotes.filter((l) => l.tanque_id === t.id), resumo, racaoHojeLocal, hoje);
  const bloco = (chave, titulo, classe) => (grupos[chave].length ? `
    <section class="grupo ${classe}"><h2>${titulo} <span class="contagem">${grupos[chave].length}</span></h2>
      <div class="grade">${grupos[chave].map(card).join('')}</div></section>` : '');
  const faltam = grupos.falta.length;

  let filtro = 'todos';
  el.innerHTML = `
    <h1>Olá, ${esc(primeiro)}</h1>
    ${resumoDia(grupos.falta.length + grupos.ok.length, faltam)}
    ${semDetalhe ? '<p class="aviso">Sem conexão: mostrando só os dados guardados no aparelho. Os totais aparecem quando houver internet.</p>' : ''}
    ${grupos.falta.length + grupos.ok.length ? `<div class="seg" style="--n:3" role="tablist">
      <button type="button" data-filtro="todos">Todos</button>
      <button type="button" data-filtro="falta">Faltam${faltam ? ` (${faltam})` : ''}</button>
      <button type="button" data-filtro="ok">Feitos${grupos.ok.length ? ` (${grupos.ok.length})` : ''}</button>
    </div>` : ''}
    <div id="lista-tanques"></div>`;

  const lista = el.querySelector('#lista-tanques');
  function pintar() {
    el.querySelectorAll('[data-filtro]').forEach((b) => b.classList.toggle('on', b.dataset.filtro === filtro));
    const mostrar = (k) => filtro === 'todos' || filtro === k;
    const partes = [
      mostrar('falta') ? bloco('falta', 'Falta alimentar', 'g-falta') : '',
      mostrar('ok') ? bloco('ok', 'Já alimentados hoje', 'g-ok') : '',
      filtro === 'todos' ? bloco('semlote', 'Sem lote', 'g-sem') : '',
    ].join('');
    lista.innerHTML = partes || `<div class="card vazio"><p>${filtro === 'falta' ? 'Todos os tanques já foram alimentados hoje.' : 'Nenhum tanque alimentado ainda hoje.'}</p></div>`;
  }
  el.querySelectorAll('[data-filtro]').forEach((b) => b.addEventListener('click', () => { filtro = b.dataset.filtro; pintar(); }));
  const atalho = el.querySelector('[data-filtrar-falta]');
  if (atalho) atalho.addEventListener('click', () => { filtro = 'falta'; pintar(); window.scrollTo({ top: 0 }); });
  pintar();
}
