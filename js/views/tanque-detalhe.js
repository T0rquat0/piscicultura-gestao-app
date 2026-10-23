// Tela de um tanque (todos os papéis): números de cada lote, sobrevivência, previsão de despesca e atalhos para lançar.
import { esc, fmtInt, fmtNum, fmtData, hojeISO, diasEntre, num, ROTULO_TIPO, faseCss, progresso, fmtPct } from '../util.js';
import * as db from '../db.js';
import { previsaoDespesca } from '../calc.js';
import { icone } from '../icons.js';
import { pedirTexto } from '../dialogo.js';
import { metaDe, htmlPrevisao } from './despesca.js';

export function htmlCardTanque(tanque, lotes, resumo, racaoHojeLocal, hoje, metas = {}) {
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
          ${vivos != null && l.quantidade_inicial > 0 ? `<div class="td-sobre">${progresso((vivos / l.quantidade_inicial) * 100, { tom: 'ok', rotulo: `Sobrevivência ${fmtPct((vivos / l.quantidade_inicial) * 100)}%` })}<p class="h-trilho-leg"><span>Sobrevivência: ${fmtInt(vivos)} de ${fmtInt(l.quantidade_inicial)} peixes</span><b>${fmtPct((vivos / l.quantidade_inicial) * 100)}%</b></p></div>` : ''}
          ${r ? `<div class="td-prev"><div class="td-prev-cab"><span>Despesca</span><button class="link" type="button" data-meta="${esc(l.id)}">Mudar meta</button></div>${htmlPrevisao(previsaoDespesca(l, r, metaDe(l, metas), hoje))}</div>` : ''}
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
  const metas = (await db.kvGet('metasDespesca')) || {};
  el.innerHTML = `<p class="no-print"><a class="voltar" href="#/">${icone('voltar', 18)} Início</a></p>
    ${semDetalhe ? '<p class="aviso">Sem conexão: os totais aparecem quando houver internet.</p>' : ''}
    ${htmlCardTanque(tanque, meus, resumo, racaoHojeLocal, hoje, metas)}
    ${meus.length ? `<a class="hub-card td-rel" href="#/relatorio/${esc(meus[0].id)}"><span class="item-ic">${icone('relatorio')}</span><span class="esq"><b>Relatório do lote</b><small>Peso, ração e mortalidade do início até hoje</small></span><span class="seta">${icone('direita', 20)}</span></a>` : ''}`;
  el.querySelectorAll('[data-meta]').forEach((b) => b.addEventListener('click', async () => {
    const l = meus.find((x) => x.id === b.dataset.meta); if (!l) return;
    const v = await pedirTexto({ titulo: 'Meta de despesca', rotulo: 'Peso médio de cada peixe na despesca (kg)', texto: String(metaDe(l, metas)).replace('.', ','), placeholder: 'Ex.: 2,5', maxlength: 8,
      validar: (t) => (num(t) > 0 && num(t) < 100 ? '' : 'Informe o peso em kg, ex.: 2,5') });
    if (!v) return;
    metas[l.id] = num(v); await db.kvSet('metasDespesca', metas);
    ctx.toast('Meta de despesca salva neste aparelho', 'ok');
    renderTanqueDetalhe(ctx, el, id);
  }));
}
