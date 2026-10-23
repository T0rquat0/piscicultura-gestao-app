// Lançamento de ração, biometria e mortalidade. Funciona sem internet:
// o item é gravado na fila local (IndexedDB) e enviado quando houver conexão.
import { icone } from '../icons.js';
import { esc, hojeISO, fmtData, fmtNum, fmtInt, num, uuid, ROTULO_TIPO, progresso, fmtPct } from '../util.js';
import * as db from '../db.js';
import { confirmar } from '../dialogo.js';
import { ordemNatural } from './home.js';
import { PESO_SACO_PADRAO_KG, CAUSAS_MORTE } from '../config.js';

const TIPOS = {
  racao: { rotulo: 'Ração', tabela: 'racao_consumo' },
  biometria: { rotulo: 'Biometria', tabela: 'biometrias' },
  mortalidade: { rotulo: 'Mortalidade', tabela: 'mortalidade' },
};

const casas = (x) => (Number.isInteger(x) ? 0 : Number.isInteger(Math.round(x * 100) / 10) ? 1 : 2);
const kgTxt = (v) => fmtNum(Number(v), casas(Number(v)));

const sacosTxt = (n) => `${fmtNum(n, casas(n))} ${n === 1 ? 'saco' : 'sacos'}`;

const TITULO2 = { racao: 'Quantidade de ração', biometria: 'Pesagem dos peixes', mortalidade: 'Peixes mortos' };

function camposDoTipo(tipo, kgSaco) {
  if (tipo === 'racao') {
    return `<label>Quantos sacos de ração?
      <input id="qtd" class="grande" type="number" inputmode="decimal" step="0.5" min="0" placeholder="0" required></label>
      <div class="calc" id="conv">Cada saco = ${fmtNum(kgSaco, 0)} kg</div>
      <button type="button" class="chip repetir" id="b-ultima" hidden></button>
      <details class="como-det"><summary>Como lançar</summary>
      <ol class="como">
        <li>Conte os sacos de ração que foram dados hoje neste tanque.</li>
        <li>Se foi meio saco, digite 0,5.</li>
        <li>Cada saco vale ${fmtNum(kgSaco, 0)} kg (muda em Mais &gt; Peso do saco).</li>
      </ol></details>`;
  }
  if (tipo === 'biometria') {
    return `
      <details class="como-det"><summary>Como pesar</summary>
      <ol class="como">
        <li>Pegue alguns peixes do tanque, de 5% a 10% do lote.</li>
        <li>Pese todos juntos, de uma vez.</li>
        <li>Anote o peso total e quantos peixes foram pesados.</li>
      </ol></details>
      <label>Peso total dos peixes (kg)
        <input id="peso" type="number" inputmode="decimal" step="0.001" min="0" placeholder="Ex.: 2,4" required></label>
      <label>Quantos peixes foram pesados?
        <input id="amostra" type="number" inputmode="numeric" step="1" min="1" placeholder="Ex.: 10" required></label>
      <div class="calc resultado" id="pm">Peso médio: —</div>
      <p id="aviso-amostra" class="aviso" hidden>Poucos peixes pesados: com menos de 30 o peso médio fica pouco confiável.</p>`;
  }
  return `<label>Quantos peixes morreram?
    <input id="qtd" class="grande" type="number" inputmode="numeric" step="1" min="1" placeholder="0" required></label>
    <details class="como-det"><summary>Como lançar</summary>
    <ol class="como">
      <li>Conte os peixes mortos encontrados hoje neste tanque.</li>
      <li>Digite o total e, se souber, escolha a causa abaixo.</li>
    </ol></details>`;
}

export async function renderLancar(ctx, el, params = {}) {
  const { state } = ctx;
  const tipo = TIPOS[params.tipo] ? params.tipo : 'racao';
  const { tanques, lotes } = state.ref;
  const kgSaco = state.ref.kgSaco || PESO_SACO_PADRAO_KG;

  if (!tanques.length) {
    el.innerHTML = `<h1>Lançar</h1><div class="card vazio"><p>Nenhum tanque disponível.${ctx.podeGerir() ? ' Cadastre um tanque primeiro.' : ' Peça ao gerente para liberar seus tanques.'}</p>${ctx.podeGerir() ? '<a class="btn primario" href="#/tanques">Ir para Tanques</a>' : ''}</div>`;
    return;
  }

  const ultimo = (await db.kvGet('ultimoTanque')) || '';
  const tanqueInicial = tanques.some((t) => t.id === params.tanque) ? params.tanque : (tanques.some((t) => t.id === ultimo) ? ultimo : tanques[0].id);
  const hoje = hojeISO();

  el.classList.remove('modo-sucesso');
  el.innerHTML = `
    <h1>Lançar</h1>
    <div class="seg" role="tablist">
      ${Object.entries(TIPOS).map(([k, v]) => `<button type="button" data-tipo="${k}" class="${k === tipo ? 'on' : ''}">${v.rotulo}</button>`).join('')}
    </div>
    <div class="pc-duas lc-duas"><div>
    <form id="f" class="form passos" novalidate>
      <section class="passo">
        <h2 class="passo-t"><i>1</i> Tanque</h2>
        <div class="campo">
          <div class="tanque-atual"><div><b id="tanque-nome">${esc((tanques.find((t) => t.id === tanqueInicial) || {}).nome || '')}</b></div>
            ${tanques.length > 1 ? `<button type="button" class="btn mini" id="b-trocar">${params.escolher ? 'Fechar' : 'Trocar'}</button>` : ''}</div>
          <div class="tiles compactos" id="tiles" role="radiogroup" aria-label="Escolha o tanque"${params.escolher ? '' : ' hidden'}>${[...tanques].sort(ordemNatural).map((t) => `<button type="button" class="tile${t.id === tanqueInicial ? ' on' : ''}" role="radio" aria-checked="${t.id === tanqueInicial}" data-tanque="${esc(t.id)}"><span>${esc(t.nome)}</span><i class="ponto"></i></button>`).join('')}</div>
          <select id="tanque" hidden>${tanques.map((t) => `<option value="${esc(t.id)}"${t.id === tanqueInicial ? ' selected' : ''}>${esc(t.nome)}</option>`).join('')}</select>
        </div>
        <p id="lote-linha" class="lote-linha" hidden></p>
        <label id="lote-wrap">Qual lote? <select id="lote"></select></label>
        <p id="aviso-lotes" class="aviso" hidden></p>
      </section>
      <section class="passo tipo-${tipo}">
        <h2 class="passo-t"><i>2</i> ${TITULO2[tipo]}</h2>
        ${camposDoTipo(tipo, kgSaco)}
        <div class="data-linha"><span>Data: <b id="data-txt">hoje</b></span><button type="button" class="link" id="b-data">Mudar</button></div>
        <label id="data-wrap" hidden>Data <input id="data" type="date" value="${hoje}" max="${hoje}" required></label>
      </section>
      ${tipo === 'mortalidade' ? `<section class="passo tipo-mortalidade">
        <h2 class="passo-t"><i>3</i> Causa provável <small class="mudo">(opcional)</small></h2>
        <div class="tiles compactos causas" id="causas">
          ${CAUSAS_MORTE.map(([r, d]) => `<button type="button" class="tile" data-causa="${esc(r)}"><span>${esc(r)}</span></button>`).join('')}
          <button type="button" class="tile" data-causa="outros"><span>Outra causa</span></button>
        </div>
        <p class="causa-dica" id="causa-dica" hidden></p>
        <label id="causa-outra-wrap" hidden>Qual foi a causa? <input id="causa-outra" maxlength="60" placeholder="Ex.: queda de energia no aerador"></label>
      </section>` : ''}
      <p id="erro" class="erro" hidden></p>
      <button class="btn primario grande" type="submit">Salvar ${TIPOS[tipo].rotulo.toLowerCase()}</button>
      ${navigator.onLine ? '' : '<p class="mudo" style="margin:0;text-align:center">Sem internet: será salvo no celular e enviado depois.</p>'}
    </form></div>
    <aside class="lc-painel" id="painel-tq" aria-label="Resumo do tanque escolhido"></aside></div>`;

  if (params.de !== undefined) { const sg = el.querySelector('.seg'); if (sg) sg.dataset.de = params.de; }
  el.querySelectorAll('.seg button').forEach((b) =>
    b.addEventListener('click', () => renderLancar(ctx, el, { tipo: b.dataset.tipo, tanque: el.querySelector('#tanque').value, de: Object.keys(TIPOS).indexOf(tipo) })));

  const f = el.querySelector('#f');
  const selTanque = f.querySelector('#tanque');
  f.querySelectorAll('#tiles .tile').forEach((b) => b.addEventListener('click', () => {
    selTanque.value = b.dataset.tanque;
    f.querySelectorAll('#tiles .tile').forEach((x) => { const on = x === b; x.classList.toggle('on', on); x.setAttribute('aria-checked', String(on)); });
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

  // painel ao lado (computador): ração dos últimos 7 dias, hoje × média e sobrevivência do tanque escolhido
  const painel = el.querySelector('#painel-tq');
  let dadosPainel = null;
  async function pintarPainel() {
    if (!painel || getComputedStyle(painel).display === 'none') return;
    const t = tanques.find((x) => x.id === selTanque.value);
    if (!t) { painel.innerHTML = ''; return; }
    const doTanque = lotes.filter((l) => l.tanque_id === t.id);
    if (!dadosPainel && navigator.onLine) {
      const d7 = new Date(`${hoje}T12:00:00`); d7.setDate(d7.getDate() - 6);
      const desde = d7.toISOString().slice(0, 10);
      dadosPainel = await Promise.all([ctx.api.racaoPeriodo(desde).catch(() => []), ctx.api.resumoLotes().catch(() => [])])
        .then(([rac, res]) => ({ rac, res: Object.fromEntries(res.map((x) => [x.lote_id, x])), desde }));
    }
    const fila = (await db.filaList()).filter((i) => i.tabela === 'racao_consumo' && i.payload.tanque_id === t.id);
    const dias = Array.from({ length: 7 }, (_, i) => { const d = new Date(`${hoje}T12:00:00`); d.setDate(d.getDate() - (6 - i)); return d.toISOString().slice(0, 10); });
    const porDia = Object.fromEntries(dias.map((d) => [d, 0]));
    for (const r of (dadosPainel && dadosPainel.rac) || []) if (r.tanque_id === t.id && r.data in porDia) porDia[r.data] += Number(r.quantidade_kg) || 0;
    for (const i of fila) if (i.payload.data in porDia) porDia[i.payload.data] += Number(i.payload.quantidade_kg) || 0;
    const ant = dias.slice(0, 6).map((d) => porDia[d]).filter((v) => v > 0);
    const media = ant.length ? ant.reduce((a, b) => a + b, 0) / ant.length : 0;
    const hojeKg = porDia[hoje];
    const maxD = Math.max(1, ...Object.values(porDia));
    const sc = (kg) => fmtNum(kg / kgSaco, kg / kgSaco < 10 && kg % kgSaco ? 1 : 0);
    let vivos = 0, ini = 0, pm = null;
    for (const l of doTanque) {
      const r = dadosPainel && dadosPainel.res[l.id];
      ini += Number(l.quantidade_inicial) || 0;
      vivos += Math.max(0, Number(l.quantidade_inicial) - Number((r && r.mortos) || 0));
      if (r && r.ultimo_peso_medio_kg != null) pm = Number(r.ultimo_peso_medio_kg);
    }
    painel.innerHTML = `
      <p class="lc-cab">Resumo do tanque</p>
      <h2>${esc(t.nome)}</h2>
      <p class="mudo" style="margin:.1rem 0 0">${doTanque.length === 1 ? `${esc(ROTULO_TIPO[doTanque[0].tipo] || doTanque[0].tipo)} · ${esc(doTanque[0].especie)}` : doTanque.length ? `${doTanque.length} lotes ativos` : 'Sem lote ativo'}</p>
      ${doTanque.length ? `<dl class="lc-num">
        <div><dt>Peixes vivos</dt><dd>${fmtInt(vivos)}</dd></div>
        <div><dt>Peso médio</dt><dd>${pm != null ? (pm < 1 ? fmtNum(pm * 1000, 0) + ' g' : fmtNum(pm, 2) + ' kg') : '—'}</dd></div>
      </dl>
      ${ini > 0 && dadosPainel ? `${progresso((vivos / ini) * 100, { tom: 'ok', fina: true, rotulo: 'Sobrevivência do lote' })}<p class="h-trilho-leg"><span>Sobrevivência</span><b>${fmtPct((vivos / ini) * 100)}%</b></p>` : ''}` : ''}
      ${tipo === 'racao' || media || hojeKg ? `<h3 class="lc-sub">Ração de hoje</h3>
      ${media ? `${progresso((hojeKg / media) * 100, { tom: hojeKg >= media ? 'ok' : '', rotulo: 'Ração de hoje comparada à média' })}
        <p class="h-trilho-leg"><span><b>${sc(hojeKg)}</b> de ~${sc(media)} sacos (média dos dias com ração)</span></p>`
        : `<p class="mudo pequeno">${hojeKg ? `${sc(hojeKg)} sacos lançados hoje.` : 'Sem ração nos últimos dias para comparar.'}</p>`}
      <h3 class="lc-sub">Últimos 7 dias</h3>
      <ul class="lc-dias">${dias.map((d) => `<li class="${d === hoje ? 'hoje' : ''}"><span>${d === hoje ? 'Hoje' : fmtData(d).slice(0, 5)}</span><i><em style="width:${((porDia[d] / maxD) * 100).toFixed(1)}%"></em></i><b>${porDia[d] ? sc(porDia[d]) : '–'}</b></li>`).join('')}</ul>
      <p class="mudo pequeno" style="margin:.4rem 0 0">Em sacos de ${fmtNum(kgSaco, 0)} kg.</p>` : ''}`;
  }
  selTanque.addEventListener('change', pintarPainel);
  pintarPainel();

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
    const sc = Math.round((v / kgSaco) * 100) / 100;
    b.textContent = `↺ Repetir ${sacosTxt(sc)} (última vez)`;
    b.onclick = () => { f.querySelector('#qtd').value = String(sc); f.querySelector('#qtd').dispatchEvent(new Event('input')); f.querySelector('#qtd').focus(); };
  }
  mostrarUltima();
  if (tipo === 'racao') {
    const q = f.querySelector('#qtd'), conv = f.querySelector('#conv');
    q.addEventListener('input', () => { const n = num(q.value); conv.textContent = n > 0 ? `${sacosTxt(n)} = ${fmtNum(n * kgSaco, 1)} kg` : `Cada saco = ${fmtNum(kgSaco, 0)} kg`; });
  }

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

  // Procura um lançamento parecido, na fila do aparelho e (com internet) no servidor.
  // Ração: mesmo tanque e dia com a mesma quantidade, ou qualquer um nos últimos 30 minutos.
  // Mortalidade: mesmo lote, dia e quantidade. Biometria: mesmo lote e dia.
  async function acharParecido(tp, pl) {
    try {
      const tab = TIPOS[tp].tabela;
      const locais = (await db.filaList()).filter((i) => i.tabela === tab && i.payload.data === pl.data && (tp === 'racao' ? i.payload.tanque_id === pl.tanque_id : i.payload.lote_id === pl.lote_id));
      let regs = locais.map((i) => ({ q: tp === 'racao' ? i.payload.quantidade_kg : i.payload.quantidade, em: i.criado_em }));
      if (navigator.onLine) {
        const rem = await Promise.race([ctx.api.registrosDoDia(tp, pl), new Promise((r) => setTimeout(() => r([]), 2500))]).catch(() => []);
        regs = regs.concat(rem.map((r) => ({ q: tp === 'racao' ? r.quantidade_kg : r.quantidade, em: r.criado_em })));
      }
      const agora = Date.now();
      const hora = (em) => new Date(em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
      if (tp === 'racao') {
        const igual = regs.find((r) => Math.abs(Number(r.q) - pl.quantidade_kg) < 0.01);
        const recente = regs.find((r) => r.em && agora - new Date(r.em).getTime() < 30 * 60000);
        const r = igual || recente; if (!r) return null;
        return `Este tanque já recebeu ${sacosTxt(Number(r.q) / kgSaco)} neste dia${r.em ? ` (às ${hora(r.em)})` : ''}.`;
      }
      if (tp === 'mortalidade') { const r = regs.find((x) => Number(x.q) === pl.quantidade); return r ? `Já há ${fmtInt(pl.quantidade)} peixe(s) morto(s) lançado(s) neste lote nesta data${r.em ? ` (às ${hora(r.em)})` : ''}.` : null; }
      return regs.length ? 'Já existe uma biometria deste lote nesta data.' : null;
    } catch { return null; }
  }

  // causa provável da mortalidade: toque escolhe, toque de novo desmarca; "Outra causa" abre o campo de texto
  let causaSel = '';
  const causaOutra = f.querySelector('#causa-outra');
  f.querySelectorAll('#causas .tile').forEach((b) => b.addEventListener('click', () => {
    causaSel = b.classList.contains('on') ? '' : b.dataset.causa;
    f.querySelectorAll('#causas .tile').forEach((x) => x.classList.toggle('on', x.dataset.causa === causaSel));
    f.querySelector('#causa-outra-wrap').hidden = causaSel !== 'outros';
    const dica = f.querySelector('#causa-dica'), par = CAUSAS_MORTE.find(([r]) => r === causaSel);
    dica.textContent = par ? par[1] : ''; dica.hidden = !par; // a explicação aparece só da causa escolhida
    if (causaSel === 'outros') causaOutra.focus();
  }));
  function causaEscolhida() {
    if (!causaSel) return '';
    if (causaSel !== 'outros') return causaSel;
    const t = causaOutra.value.trim().slice(0, 60);
    return t ? `Outros: ${t}` : 'Outros';
  }

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
      if (!(q > 0)) return mostrarErro('Informe quantos sacos de ração (pode ser meio saco: 0,5).');
      if (q * kgSaco > 2000) return mostrarErro('Quantidade muito alta. Confira o número de sacos.');
      payload = { ...base, tanque_id: selTanque.value, quantidade_kg: Math.round(q * kgSaco * 100) / 100 };
    } else if (tipo === 'biometria') {
      const p = num(f.querySelector('#peso').value), q = num(f.querySelector('#amostra').value);
      if (!(p > 0)) return mostrarErro('Informe o peso total da amostra em kg.');
      if (!(q >= 1) || !Number.isInteger(q)) return mostrarErro('Informe quantos peixes foram pesados (número inteiro).');
      payload = { ...base, peso_amostra_kg: p, quantidade_amostrada: q };
    } else {
      const q = num(f.querySelector('#qtd').value);
      if (!(q >= 1) || !Number.isInteger(q)) return mostrarErro('Informe a quantidade de peixes mortos (número inteiro).');
      payload = { ...base, quantidade: q };
      const causa = causaEscolhida();
      if (causa) payload.causa = causa;
    }

    // possível lançamento duplicado (dois toques, ou duas pessoas lançando o mesmo)
    const btn = f.querySelector('button[type=submit]');
    btn.disabled = true;
    const parecido = await acharParecido(tipo, payload);
    if (parecido) {
      const ok = await confirmar({ titulo: 'Isso já foi lançado?', texto: `${parecido} Lançar de novo mesmo assim?`, ok: 'Lançar mesmo assim', cancelar: 'Não lançar' });
      if (!ok) { btn.disabled = false; return; }
    }
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
    const resumo = tipo === 'racao' ? `${sacosTxt(num(f.querySelector('#qtd').value))} de ração (${kgTxt(payload.quantidade_kg)} kg)`
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
    el.classList.add('modo-sucesso'); // some título, abas e descrição: a tela fica só com a confirmação
    f.outerHTML = `
      <div class="sucesso card" role="status">
        <div class="sucesso-ic">${icone('check', 34)}</div>
        <h2>${TIPOS[tipo].rotulo} salva</h2>
        <p class="sucesso-res"><b>${esc(nomeTanque)}</b> · ${esc(resumo)}</p>
        ${navigator.onLine ? '' : '<p class="mudo nota">Sem internet: guardado no celular. Será enviado sozinho quando a internet voltar.</p>'}
        <div class="sucesso-acoes">
          ${proximo ? `<button type="button" class="btn primario grande" id="b-proximo">Próximo: ${esc(proximo.nome)}</button>` : `<button type="button" class="btn primario grande" id="b-outro">Lançar em outro tanque</button>`}
          <div class="sucesso-links">${proximo ? '<button type="button" class="link" id="b-outro">Outro tanque</button><span aria-hidden="true">·</span>' : ''}<a class="link" href="#/">Voltar ao início</a></div>
        </div>
      </div>`;
    el.querySelector('#b-outro').addEventListener('click', () => renderLancar(ctx, el, { tipo, escolher: '1' }));
    const bp = el.querySelector('#b-proximo');
    if (bp) bp.addEventListener('click', () => renderLancar(ctx, el, { tipo, tanque: proximo.id }));
  });
}
