// Meus lançamentos: o que a pessoa lançou hoje (no aparelho e já enviado), com Desfazer (5 minutos)
// e, depois disso, o caminho para corrigir no mesmo dia. No dia seguinte, só o dono ou o gerente corrige.
import { esc, hojeISO, fmtData } from '../util.js';
import { icone } from '../icons.js';
import * as db from '../db.js';
import { descricao } from './pendencias.js';
import { desfazerLancamento, minutosParaDesfazer, PRAZO_DESFAZER_MIN } from '../desfazer.js';

const horaDe = (iso) => (iso ? new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '');

export async function renderMeus(ctx, el) {
  const { state } = ctx;
  const meuId = state.perfil.id;
  const hoje = hojeISO();
  const desde = new Date(`${hoje}T00:00:00`).toISOString(); // meia-noite de hoje no horário do aparelho
  el.innerHTML = '<h1>Meus lançamentos</h1><p class="sub-titulo">Carregando…</p>';

  const fila = (await db.filaList().catch(() => [])).filter((i) => i.registrado_por === meuId);
  let doBanco = [], semSinal = !navigator.onLine;
  if (!semSinal) {
    try { doBanco = await ctx.api.meusLancamentosHoje(meuId, desde); } catch { semSinal = true; }
  }
  if (!el.isConnected) return;
  // no aparelho: tudo o que ainda não foi enviado (de qualquer dia); do banco: o de hoje
  const porUuid = new Map();
  for (const r of doBanco) porUuid.set(r.payload.uuid_local || `id:${r.tabela}:${r.payload.id}`, { tabela: r.tabela, payload: r.payload, criadoEm: r.payload.criado_em, onde: 'banco' });
  for (const i of fila) if (!porUuid.has(i.uuid_local)) porUuid.set(i.uuid_local, { tabela: i.tabela, payload: i.payload, criadoEm: i.criado_em, onde: i.status === 'erro' ? 'erro' : 'fila', erro: i.erro });
  const itens = [...porUuid.entries()].map(([chave, v]) => ({ chave, ...v })).sort((a, b) => String(b.criadoEm || '').localeCompare(String(a.criadoEm || '')));

  const { lotes } = state.ref;
  // onde corrigir: Relatório do lote > Lançamentos (a água é do tanque: vai para o lote ativo dele)
  const loteDe = (it) => it.payload.lote_id || ((lotes.find((l) => l.tanque_id === it.payload.tanque_id) || {}).id) || '';
  const sit = (it) => (it.onde === 'banco' ? '<span class="sit ok">✓ Enviado</span>' : it.onde === 'erro' ? '<span class="sit ruim">Não enviado</span>' : '<span class="sit falta">No celular</span>');

  el.innerHTML = `
    <h1>Meus lançamentos</h1>
    <p class="sub-titulo">Hoje · o que você lançou</p>
    ${semSinal ? '<p class="aviso">Sem internet: aparece só o que está guardado neste celular.</p>' : ''}
    ${itens.length ? `<div class="card"><ul class="lista meus-lista">${itens.map((it) => {
      const d = descricao({ tabela: it.tabela, payload: it.payload }, state.ref);
      const min = it.chave.startsWith('id:') ? 0 : minutosParaDesfazer(it.tabela, it.criadoEm);
      const lote = loteDe(it);
      const corrigir = !min && it.onde === 'banco' && it.tabela !== 'despescas' && lote && it.payload.data;
      return `<li class="meu" data-chave="${esc(it.chave)}">
        <div class="meu-cab"><span class="esq"><b>${esc(d.titulo)}</b><small>${esc([horaDe(it.criadoEm), d.valor, it.payload.data && it.payload.data !== hoje ? `para ${fmtData(it.payload.data)}` : ''].filter(Boolean).join(' · '))}</small>
          ${it.onde === 'erro' ? `<small style="color:var(--erro)">${esc(it.erro || 'Erro no envio')}: veja em Pendentes</small>` : ''}</span>${sit(it)}</div>
        ${min ? `<div class="meu-acoes"><button type="button" class="btn mini" data-desfazer="${esc(it.chave)}">${icone('desfazer', 18)} Desfazer (${min} min)</button></div>`
          : corrigir ? `<div class="meu-acoes"><a class="btn mini" href="#/relatorio/${esc(lote)}?aba=registros">Corrigir</a></div>` : ''}
      </li>`;
    }).join('')}</ul></div>` : `<div class="card vazio"><p>Nada lançado hoje ainda.</p><a class="btn primario" href="#/">Ir para a ronda</a></div>`}
    <div class="card ronda-protocolo"><b>Errou algum número?</b>
      <ol>
        <li><b>Desfazer</b>: até ${PRAZO_DESFAZER_MIN} minutos depois de salvar. O lançamento some e você lança de novo.</li>
        <li>Depois disso, até o fim do dia: <b>Corrigir</b> (abre o lote, em Lançamentos).</li>
        <li>No dia seguinte, só o dono ou o gerente corrige.</li>
        <li>Não lance de novo para compensar: soma em dobro.</li>
      </ol></div>`;

  el.querySelectorAll('[data-desfazer]').forEach((b) => b.addEventListener('click', async () => {
    const it = itens.find((x) => x.chave === b.dataset.desfazer);
    if (!it || b.disabled) return;
    b.disabled = true;
    try {
      await desfazerLancamento(ctx, { uuidLocal: it.chave, tabela: it.tabela, payload: it.payload, criadoEm: it.criadoEm });
      ctx.toast('Desfeito. Pode lançar de novo.', 'ok');
    } catch (e) {
      ctx.toast((e && e.message) || 'Não foi possível desfazer.', 'erro');
    }
    if (el.isConnected) renderMeus(ctx, el);
  }));

  // o "Desfazer (x min)" conta sozinho; quando o prazo de algum acaba, a lista se redesenha
  if (itens.some((it) => !it.chave.startsWith('id:') && minutosParaDesfazer(it.tabela, it.criadoEm))) {
    const relogio = setInterval(() => {
      if (!el.isConnected) { clearInterval(relogio); return; }
      let mudou = false;
      el.querySelectorAll('[data-desfazer]').forEach((b) => {
        const it = itens.find((x) => x.chave === b.dataset.desfazer);
        const m = it ? minutosParaDesfazer(it.tabela, it.criadoEm) : 0;
        if (!m) mudou = true; else b.lastChild.textContent = ` Desfazer (${m} min)`;
      });
      if (mudou) { clearInterval(relogio); renderMeus(ctx, el); }
    }, 15000);
  }
}
