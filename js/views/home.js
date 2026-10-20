import { esc, fmtInt, fmtNum, fmtData, hojeISO, diasEntre, ROTULO_TIPO } from '../util.js';
import * as db from '../db.js';
import { situacaoEstoque } from '../calc.js';
import { ESTOQUE_ATENCAO_DIAS, ESTOQUE_CRITICO_DIAS, PESO_SACO_PADRAO_KG, CONTAGEM_LEMBRETE_DIAS, PLANO_AVISO_DIAS } from '../config.js';
import { icone } from '../icons.js';
import { pedirTexto } from '../dialogo.js';

export function cartaoEstoque(s, kgS) {
  if (!s) return '';
  const kg = Number(s.saldo_kg) || 0;
  const sit = situacaoEstoque(kg, s.consumo_7d_kg, ESTOQUE_ATENCAO_DIAS, ESTOQUE_CRITICO_DIAS);
  const txt = sit.nivel === 'negativo' ? 'confira o estoque' : sit.dias != null ? `dura ~${fmtNum(Math.floor(sit.dias), 0)} dias` : 'sem consumo recente';
  return `<a class="est-card n-${sit.nivel}" href="#/estoque"><span class="est-ic">${icone('estoque', 22)}</span>
    <span class="est-t"><small>Ração em estoque</small><b>${kg < 0 ? '−' : ''}${fmtNum(Math.abs(kg) / kgS, 0)} sacos</b></span>
    <span class="est-d">${esc(txt)}</span></a>`;
}

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

export function htmlTileTanque(tanque, lotesDoTanque, resumo, status) {
  const l = lotesDoTanque[0];
  const r = l ? resumo[l.id] : null;
  const esp = !l ? 'Sem lote ativo' : lotesDoTanque.length > 1 ? `${lotesDoTanque.length} lotes ativos` : `${ROTULO_TIPO[l.tipo] || l.tipo} · ${l.especie}`;
  const peso = r && r.ultimo_peso_medio_kg != null ? `${fmtNum(r.ultimo_peso_medio_kg * 1000, 0)}<em>g</em>` : '—';
  const sub = status === 'ok' ? 'Alimentado hoje' : status === 'falta' ? 'Falta alimentar' : '';
  return `<a class="mini ${status}" href="#/t/${esc(tanque.id)}">
    <span class="mini-topo"><b>${esc(tanque.nome)}</b>${status === 'semlote' ? '' : '<i class="ponto"></i>'}</span>
    <span class="mini-esp">${esc(esp)}</span>
    ${status === 'semlote' ? '' : `<span class="mini-num">${peso}</span>${r && r.ultimo_peso_medio_kg != null ? '<span class="mini-rot">peso médio</span>' : ''}<small>${sub}</small>`}
  </a>`;
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
    ${meus.length ? `<a class="btn grande" href="#/relatorio/${esc(meus[0].id)}">Ver relatório do lote</a>` : ''}`;
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

  el.innerHTML = `<h1>Olá, ${esc(primeiro)}</h1><p class="carregando">Carregando tanques…</p>`;
  const resumo = {};
  let semDetalhe = false;
  let saldoRacao = null;
  if (navigator.onLine) {
    const pSaldo = ctx.api.saldoRacao().catch(() => null);
    try { for (const r of await ctx.api.resumoLotes()) resumo[r.lote_id] = r; } catch { semDetalhe = true; }
    saldoRacao = await pSaldo;
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
  const card = (t) => htmlTileTanque(t, lotes.filter((l) => l.tanque_id === t.id), resumo, status[t.id]);
  const bloco = (chave, titulo, classe) => (grupos[chave].length ? `
    <section class="grupo ${classe}"><h2>${titulo} <span class="contagem">${grupos[chave].length}</span></h2>
      <div class="minis">${grupos[chave].map(card).join('')}</div></section>` : '');
  const faltam = grupos.falta.length;

  let filtro = 'todos';
  el.innerHTML = `
    <h1>Olá, ${esc(primeiro)}</h1>
    <div id="avisos">${avisoContagem(ctx, saldoRacao, hoje)}</div>
    ${resumoDia(grupos.falta.length + grupos.ok.length, faltam)}
    ${cartaoEstoque(saldoRacao, state.ref.kgSaco || PESO_SACO_PADRAO_KG)}
    ${semDetalhe ? '<p class="aviso">Sem conexão: mostrando só os dados guardados no aparelho. Os totais aparecem quando houver internet.</p>' : ''}
    ${grupos.falta.length + grupos.ok.length ? `<div class="seg" style="--n:3" role="tablist">
      <button type="button" data-filtro="todos">Todos</button>
      <button type="button" data-filtro="falta">Faltam${faltam ? ` (${faltam})` : ''}</button>
      <button type="button" data-filtro="ok">Feitos${grupos.ok.length ? ` (${grupos.ok.length})` : ''}</button>
    </div>` : ''}
    <div id="lista-tanques"></div>
    ${ctx.podeGerir() ? `<div class="minis"><button class="mini novo" id="b-novo-tanque" type="button"><span class="novo-ic">${icone('lancar', 22)}</span><b>Novo tanque</b></button></div>` : ''}`;
  const bn = el.querySelector('#b-novo-tanque'); if (bn) bn.addEventListener('click', () => novoTanque(ctx, el));

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
  avisoPlano(ctx, el.querySelector('#avisos'));
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
