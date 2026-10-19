// Lançamento de ração, biometria e mortalidade. Funciona sem internet:
// o item é gravado na fila local (IndexedDB) e enviado quando houver conexão.
import { icone } from '../icons.js';
import { esc, hojeISO, fmtData, fmtNum, fmtInt, num, uuid, ROTULO_TIPO } from '../util.js';
import * as db from '../db.js';
import { ordemNatural } from './home.js';

const TIPOS = {
  racao: { rotulo: 'Ração', tabela: 'racao_consumo' },
  biometria: { rotulo: 'Biometria', tabela: 'biometrias' },
  mortalidade: { rotulo: 'Mortalidade', tabela: 'mortalidade' },
};

const kgTxt = (v) => fmtNum(v, Number.isInteger(Number(v)) ? 0 : 2);

function camposDoTipo(tipo) {
  if (tipo === 'racao') {
    return `<label>Quantos kg de ração?
      <input id="qtd" class="grande" type="number" inputmode="decimal" step="0.01" min="0" placeholder="0" required></label>
      <button type="button" class="chip" id="b-ultima" hidden></button>`;
  }
  if (tipo === 'biometria') {
    return `
      <div class="duas">
        <label>Peso de todos os peixes pesados juntos (kg)
          <input id="peso" type="number" inputmode="decimal" step="0.001" min="0" placeholder="Ex.: 2,4" required></label>
        <label>Quantos peixes foram pesados
          <input id="amostra" type="number" inputmode="numeric" step="1" min="1" placeholder="Ex.: 10" required></label>
      </div>
      <div class="calc" id="pm">Peso médio: —</div>
      <p id="aviso-amostra" class="aviso" hidden>Amostra pequena: com menos de 30 peixes o peso médio fica pouco confiável. O ideal é pesar de 5% a 10% do lote.</p>`;
  }
  return `<label>Quantos peixes morreram?
    <input id="qtd" class="grande" type="number" inputmode="numeric" step="1" min="1" placeholder="0" required></label>`;
}

export async function renderLancar(ctx, el, params = {}) {
  const { state } = ctx;
  const tipo = TIPOS[params.tipo] ? params.tipo : 'racao';
  const { tanques, lotes } = state.ref;

  if (!tanques.length) {
    el.innerHTML = `<h1>Lançar</h1><div class="card vazio"><p>Nenhum tanque disponível.${ctx.podeGerir() ? ' Cadastre um tanque primeiro.' : ' Peça ao gerente para liberar seus tanques.'}</p>${ctx.podeGerir() ? '<a class="btn primario" href="#/tanques">Ir para Tanques</a>' : ''}</div>`;
    return;
  }

  const ultimo = (await db.kvGet('ultimoTanque')) || '';
  const tanqueInicial = tanques.some((t) => t.id === params.tanque) ? params.tanque : (tanques.some((t) => t.id === ultimo) ? ultimo : tanques[0].id);
  const hoje = hojeISO();

  el.innerHTML = `
    <h1>Lançar</h1>
    <div class="seg" role="tablist">
      ${Object.entries(TIPOS).map(([k, v]) => `<button type="button" data-tipo="${k}" class="${k === tipo ? 'on' : ''}">${v.rotulo}</button>`).join('')}
    </div>
    <form id="f" class="form card" novalidate>
      <div class="campo">
        <div class="tanque-atual"><div><span class="rotulo">Tanque</span><b id="tanque-nome">${esc((tanques.find((t) => t.id === tanqueInicial) || {}).nome || '')}</b></div>
          ${tanques.length > 1 ? `<button type="button" class="btn mini" id="b-trocar">${params.escolher ? 'Fechar' : 'Trocar'}</button>` : ''}</div>
        <div class="tiles compactos" id="tiles" role="radiogroup" aria-label="Escolha o tanque"${params.escolher ? '' : ' hidden'}>${[...tanques].sort(ordemNatural).map((t) => `<button type="button" class="tile${t.id === tanqueInicial ? ' on' : ''}" role="radio" aria-checked="${t.id === tanqueInicial}" data-tanque="${esc(t.id)}"><span>${esc(t.nome)}</span><i class="ponto"></i></button>`).join('')}</div>
        <select id="tanque" hidden>${tanques.map((t) => `<option value="${esc(t.id)}"${t.id === tanqueInicial ? ' selected' : ''}>${esc(t.nome)}</option>`).join('')}</select>
      </div>
      <p id="lote-linha" class="lote-linha" hidden></p>
      <label id="lote-wrap">Qual lote? <select id="lote"></select></label>
      <p id="aviso-lotes" class="aviso" hidden></p>
      <div class="data-linha"><span>Data: <b id="data-txt">hoje</b></span><button type="button" class="link" id="b-data">Mudar</button></div>
      <label id="data-wrap" hidden>Data <input id="data" type="date" value="${hoje}" max="${hoje}" required></label>
      ${camposDoTipo(tipo)}
      <p id="erro" class="erro" hidden></p>
      <button class="btn primario grande" type="submit">Salvar ${TIPOS[tipo].rotulo.toLowerCase()}</button>
      <p class="mudo" style="margin:0;text-align:center">${navigator.onLine ? 'Será enviado ao servidor agora.' : 'Sem internet: será salvo no celular e enviado depois.'}</p>
    </form>`;

  el.querySelectorAll('.seg button').forEach((b) =>
    b.addEventListener('click', () => renderLancar(ctx, el, { tipo: b.dataset.tipo, tanque: el.querySelector('#tanque').value })));

  const f = el.querySelector('#f');
  const selTanque = f.querySelector('#tanque');
  f.querySelectorAll('.tile').forEach((b) => b.addEventListener('click', () => {
    selTanque.value = b.dataset.tanque;
    f.querySelectorAll('.tile').forEach((x) => { const on = x === b; x.classList.toggle('on', on); x.setAttribute('aria-checked', String(on)); });
    selTanque.dispatchEvent(new Event('change'));
    f.querySelector('#tanque-nome').textContent = (tanques.find((t) => t.id === b.dataset.tanque) || {}).nome || '';
    fecharTiles();
    mostrarUltima();
  }));
  function fecharTiles() { const t = f.querySelector('#tiles'); t.hidden = true; const bt = f.querySelector('#b-trocar'); if (bt) bt.textContent = 'Trocar'; }
  const btTrocar = f.querySelector('#b-trocar');
  if (btTrocar) btTrocar.addEventListener('click', () => {
    const t = f.querySelector('#tiles'); t.hidden = !t.hidden; btTrocar.textContent = t.hidden ? 'Trocar' : 'Fechar';
  });
  const dataIn = f.querySelector('#data');
  f.querySelector('#b-data').addEventListener('click', () => {
    const w = f.querySelector('#data-wrap'); w.hidden = !w.hidden;
    f.querySelector('#b-data').textContent = w.hidden ? 'Mudar' : 'Fechar';
    if (!w.hidden) dataIn.focus();
  });
  dataIn.addEventListener('input', () => { f.querySelector('#data-txt').textContent = !dataIn.value || dataIn.value === hoje ? 'hoje' : fmtData(dataIn.value); });
  const selLote = f.querySelector('#lote');
  const erro = f.querySelector('#erro');
  const mostrarErro = (m) => { erro.textContent = m; erro.hidden = false; };

  function montarLotes() {
    const doTanque = lotes.filter((l) => l.tanque_id === selTanque.value);
    if (!doTanque.length) {
      selLote.innerHTML = '<option value="">— sem lote ativo —</option>';
      selLote.disabled = true;
      f.querySelector('#lote-wrap').hidden = false;
      f.querySelector('#lote-linha').hidden = true;
      f.querySelector('#aviso-lotes').hidden = true;
      mostrarErro('Este tanque não tem lote ativo. Peça ao gerente para cadastrar o lote.');
      return;
    }
    erro.hidden = true;
    selLote.disabled = false;
    f.querySelector('#lote-wrap').hidden = doTanque.length < 2;
    const linha = f.querySelector('#lote-linha');
    linha.hidden = doTanque.length !== 1;
    if (doTanque.length === 1) linha.textContent = `${ROTULO_TIPO[doTanque[0].tipo] || doTanque[0].tipo} · ${doTanque[0].especie}`;
    const avisoLotes = f.querySelector('#aviso-lotes');
    avisoLotes.hidden = !(doTanque.length > 1 && tipo === 'racao');
    avisoLotes.textContent = 'Este tanque tem mais de um lote ativo. A ração será contada só no lote escolhido acima.';
    selLote.innerHTML = doTanque.map((l) => `<option value="${esc(l.id)}">${esc(ROTULO_TIPO[l.tipo] || l.tipo)} · ${esc(l.especie)} · desde ${fmtData(l.data_entrada)}</option>`).join('');
  }
  selTanque.addEventListener('change', montarLotes);
  montarLotes();

  if (tipo === 'biometria') {
    // mortos por lote (só com internet): permite estimar os peixes vivos e a biomassa na hora
    let mortos = null;
    const atualizaPm = () => {
      const p = num(f.querySelector('#peso').value), q = num(f.querySelector('#amostra').value);
      const pm = f.querySelector('#pm'), aviso = f.querySelector('#aviso-amostra');
      if (!(p > 0 && q > 0)) { pm.textContent = 'Peso médio: —'; aviso.hidden = true; return; }
      const medioG = (p / q) * 1000;
      let txt = `Peso médio: ${fmtNum(medioG, 0)} g por peixe`;
      const lote = lotes.find((l) => l.id === selLote.value);
      if (lote && mortos) {
        const vivos = Math.max(0, Number(lote.quantidade_inicial) - (mortos[lote.id] || 0));
        txt += `\nBiomassa estimada do tanque: ${fmtNum((vivos * medioG) / 1000, 0)} kg (${fmtInt(vivos)} peixes vivos)`;
      }
      pm.textContent = txt;
      aviso.hidden = !(q < 30);
    };
    f.querySelector('#peso').addEventListener('input', atualizaPm);
    f.querySelector('#amostra').addEventListener('input', atualizaPm);
    selLote.addEventListener('change', atualizaPm);
    selTanque.addEventListener('change', atualizaPm);
    if (navigator.onLine) {
      ctx.api.resumoLotes().then((r) => { mortos = Object.fromEntries(r.map((x) => [x.lote_id, Number(x.mortos)])); atualizaPm(); }).catch(() => {});
    }
  }

  async function mostrarUltima() {
    const b = f.querySelector('#b-ultima');
    if (!b) return;
    const m = (await db.kvGet('ultimaRacao')) || {};
    const v = m[selTanque.value];
    if (!(v > 0)) { b.hidden = true; return; }
    b.hidden = false;
    b.textContent = `Última vez neste tanque: ${kgTxt(v)} kg. Toque para usar`;
    b.onclick = () => { f.querySelector('#qtd').value = String(v); f.querySelector('#qtd').focus(); };
  }
  mostrarUltima();

  // marca os tanques que já receberam ração hoje (fila local + servidor, quando houver internet)
  async function marcarAlimentados() {
    const feitos = new Set((await db.filaList()).filter((i) => i.tabela === 'racao_consumo' && i.payload.data === hoje).map((i) => i.payload.tanque_id));
    if (navigator.onLine) {
      try { for (const r of await ctx.api.resumoLotes()) { if (r.ultima_racao === hoje) { const l = lotes.find((x) => x.id === r.lote_id); if (l) feitos.add(l.tanque_id); } } } catch { /* sem detalhe */ }
    }
    feitosHoje = feitos;
    const tiles = f.querySelector('#tiles');
    const lista = [...tiles.querySelectorAll('.tile')];
    lista.forEach((b) => { const ok = feitos.has(b.dataset.tanque); const tem = lotes.some((l) => l.tanque_id === b.dataset.tanque); b.classList.toggle('feito', ok); b.classList.toggle('pend', !ok && tem); b.title = ok ? 'já recebeu ração hoje' : ''; });
    lista.sort((a, b2) => Number(a.classList.contains('feito')) - Number(b2.classList.contains('feito'))).forEach((b) => tiles.appendChild(b));
  }
  let feitosHoje = null;
  if (tipo === 'racao') marcarAlimentados();

  f.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    erro.hidden = true;
    const lote_id = selLote.value;
    const data = f.querySelector('#data').value;
    if (!lote_id) return mostrarErro('Selecione um tanque com lote ativo.');
    if (!data) return mostrarErro('Informe a data.');

    const id = uuid();
    const base = { uuid_local: id, lote_id, data, registrado_por: state.perfil.id };
    let payload;
    if (tipo === 'racao') {
      const q = num(f.querySelector('#qtd').value);
      if (!(q > 0)) return mostrarErro('Informe a quantidade de ração em kg (maior que zero).');
      payload = { ...base, tanque_id: selTanque.value, quantidade_kg: q };
    } else if (tipo === 'biometria') {
      const p = num(f.querySelector('#peso').value), q = num(f.querySelector('#amostra').value);
      if (!(p > 0)) return mostrarErro('Informe o peso total da amostra em kg.');
      if (!(q >= 1) || !Number.isInteger(q)) return mostrarErro('Informe quantos peixes foram pesados (número inteiro).');
      payload = { ...base, peso_amostra_kg: p, quantidade_amostrada: q };
    } else {
      const q = num(f.querySelector('#qtd').value);
      if (!(q >= 1) || !Number.isInteger(q)) return mostrarErro('Informe a quantidade de peixes mortos (número inteiro).');
      payload = { ...base, quantidade: q };
    }

    const btn = f.querySelector('button[type=submit]');
    btn.disabled = true;
    try {
      await db.filaAdd({
        uuid_local: id, tabela: TIPOS[tipo].tabela, payload,
        registrado_por: state.perfil.id, criado_em: new Date().toISOString(), status: 'pendente', erro: null, tentativas: 0,
      });
      await db.kvSet('ultimoTanque', selTanque.value);
    } catch (e) {
      btn.disabled = false;
      return mostrarErro('Não foi possível salvar no aparelho: ' + (e && e.message ? e.message : 'armazenamento indisponível'));
    }
    if (tipo === 'racao') {
      try { const m = (await db.kvGet('ultimaRacao')) || {}; m[selTanque.value] = payload.quantidade_kg; await db.kvSet('ultimaRacao', m); } catch { /* opcional */ }
    }
    await ctx.atualizarPendentes();
    ctx.sincronizarAgora(); // em segundo plano; não trava a tela
    const nomeTanque = (tanques.find((t) => t.id === selTanque.value) || {}).nome || '';
    const resumo = tipo === 'racao' ? `${kgTxt(payload.quantidade_kg)} kg de ração`
      : tipo === 'biometria' ? `${fmtNum((payload.peso_amostra_kg / payload.quantidade_amostrada) * 1000, 0)} g de peso médio (${fmtInt(payload.quantidade_amostrada)} peixes pesados)`
      : `${fmtInt(payload.quantidade)} peixe(s) morto(s)`;
    ctx.toast(navigator.onLine ? 'Salvo. Enviando…' : 'Salvo no celular. Será enviado quando houver internet.', 'ok');
    // sugestão de ronda: o próximo tanque (em ordem) que ainda não recebeu ração hoje
    let proximo = null;
    if (tipo === 'racao') {
      const feitos = new Set([...(feitosHoje || []), selTanque.value]);
      const ordem = [...tanques].sort(ordemNatural).filter((t) => lotes.some((l) => l.tanque_id === t.id));
      const i = ordem.findIndex((t) => t.id === selTanque.value);
      proximo = [...ordem.slice(i + 1), ...ordem.slice(0, Math.max(i, 0))].find((t) => !feitos.has(t.id)) || null;
    }
    f.outerHTML = `
      <div class="sucesso card" role="status">
        <div class="sucesso-ic">${icone('check', 40)}</div>
        <h2>${TIPOS[tipo].rotulo} salva</h2>
        <p class="sucesso-res"><b>${esc(nomeTanque)}</b><br>${esc(resumo)}</p>
        <p class="mudo">${navigator.onLine ? 'Enviando para o servidor.' : 'Sem internet: guardado no celular. Será enviado sozinho quando a internet voltar.'}</p>
        <div class="dialogo-acoes">
          ${proximo ? `<button type="button" class="btn primario grande" id="b-proximo">Próximo: ${esc(proximo.nome)}</button>` : ''}
          <button type="button" class="btn ${proximo ? '' : 'primario '}grande" id="b-outro">${proximo ? 'Escolher outro tanque' : 'Lançar em outro tanque'}</button>
          <a class="btn grande" href="#/">Voltar ao início</a>
        </div>
      </div>`;
    el.querySelector('#b-outro').addEventListener('click', () => renderLancar(ctx, el, { tipo, escolher: '1' }));
    const bp = el.querySelector('#b-proximo');
    if (bp) bp.addEventListener('click', () => renderLancar(ctx, el, { tipo, tanque: proximo.id }));
  });
}
