import { esc, fmtInt, fmtNum, fmtData, hojeISO, diasEntre, ROTULO_TIPO } from '../util.js';
import * as db from '../db.js';

export function htmlCardTanque(tanque, lotes, resumo, racaoHojeLocal, hoje) {
  const blocos = lotes.length
    ? lotes.map((l) => {
        const r = resumo[l.id];
        const dias = diasEntre(l.data_entrada, hoje);
        const vivos = r ? Math.max(0, l.quantidade_inicial - Number(r.mortos)) : null;
        return `
        <div class="dados">
          <div><span class="mudo">Lote</span><b>${esc(ROTULO_TIPO[l.tipo] || l.tipo)} · ${esc(l.especie)}</b></div>
          <div><span class="mudo">Dias no tanque</span><b>${fmtInt(dias)}</b></div>
          <div><span class="mudo">Peixes vivos (estim.)</span><b>${fmtInt(vivos ?? l.quantidade_inicial)}</b></div>
          <div><span class="mudo">Ração acumulada</span><b>${r ? fmtNum(r.racao_kg, 0) + ' kg' : '—'}</b></div>
          <div><span class="mudo">Peso médio atual</span><b>${r && r.ultimo_peso_medio_kg != null ? fmtNum(r.ultimo_peso_medio_kg * 1000, 0) + ' g' : '—'}</b>
            ${r && r.ultima_biometria ? `<small>em ${fmtData(r.ultima_biometria)}</small>` : ''}</div>
        </div>`;
      }).join('')
    : '<p class="mudo">Sem lote ativo neste tanque.</p>';

  const comLote = lotes.length > 0;
  const lancouHoje = lotes.some((l) => resumo[l.id] && resumo[l.id].ultima_racao === hoje) || racaoHojeLocal.has(tanque.id);
  const selo = !comLote ? '' : lancouHoje
    ? '<span class="tag ok">Ração lançada hoje</span>'
    : '<span class="tag alerta">Sem ração hoje</span>';

  return `
  <article class="card">
    <header><h3>${esc(tanque.nome)}</h3>${selo}</header>
    ${blocos}
    ${comLote ? `<div class="acoes">
      <a class="btn mini primario" href="#/lancar?tipo=racao&tanque=${esc(tanque.id)}">+ Ração</a>
      <a class="btn mini" href="#/lancar?tipo=biometria&tanque=${esc(tanque.id)}">Biometria</a>
      <a class="btn mini" href="#/lancar?tipo=mortalidade&tanque=${esc(tanque.id)}">Mortalidade</a>
    </div>` : ''}
  </article>`;
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

  el.innerHTML = `
    <h1>Olá, ${esc(primeiro)}</h1>
    ${semDetalhe ? '<p class="aviso">Sem conexão: mostrando só os dados guardados no aparelho. Os totais aparecem quando houver internet.</p>' : ''}
    <div class="grade">
      ${tanques.map((t) => htmlCardTanque(t, lotes.filter((l) => l.tanque_id === t.id), resumo, racaoHojeLocal, hoje)).join('')}
    </div>`;
}
