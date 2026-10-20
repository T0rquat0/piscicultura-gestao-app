// Estoque de ração: saldo (todos veem, só em kg) e compras (dono/gerente veem e lançam custo).
import { confirmar, formulario } from '../dialogo.js';
import { esc, fmtData, fmtNum, fmtInt, fmtBRL, hojeISO, num } from '../util.js';
import { PESO_SACO_PADRAO_KG } from '../config.js';

import { situacaoEstoque, sugestaoCompraKg } from '../calc.js';
import { diasEntre } from '../util.js';
import { ESTOQUE_ATENCAO_DIAS, ESTOQUE_CRITICO_DIAS, ESTOQUE_COBERTURA_DIAS, CONTAGEM_LEMBRETE_DIAS } from '../config.js';

const MENSAGEM = {
  critico: 'Estoque acabando. Compre já e conte o que sobrou.',
  atencao: 'Planeje a próxima compra. Com pouco estoque, contar é rápido: aproveite para contar.',
  negativo: 'O consumo lançado passou do que foi comprado. Confira as compras e faça uma contagem.',
  'sem-dado': 'Sem consumo nos últimos 7 dias para estimar quanto dura.',
  ok: 'Estoque tranquilo.',
};

export async function renderEstoque(ctx, el) {
  el.innerHTML = '<h1>Estoque de ração</h1><p class="carregando">Carregando…</p>';
  const gerir = ctx.podeGerir();
  const kgS = ctx.state.ref.kgSaco || PESO_SACO_PADRAO_KG;
  const sc = (kg, d = 1) => { const v = Number(kg) / kgS; return fmtNum(v, Math.abs(v - Math.round(v)) < 0.05 ? 0 : d); };
  const [saldo, compras, consumo, contagens] = await Promise.all([
    ctx.api.saldoRacao(), ctx.api.compras(gerir),
    ctx.api.consumoDiario(30).catch(() => []),
    gerir ? ctx.api.contagens().catch(() => []) : Promise.resolve([]),
  ]);
  const comprado = Number(saldo?.total_comprado_kg || 0);
  const consumido = Number(saldo?.total_consumido_kg || 0);
  const ajustes = Number(saldo?.total_ajustes_kg || 0);
  const kg = Number(saldo?.saldo_kg || 0);
  const hoje = hojeISO();
  const sit = situacaoEstoque(kg, saldo?.consumo_7d_kg, ESTOQUE_ATENCAO_DIAS, ESTOQUE_CRITICO_DIAS);
  const ult = contagens[0];
  const sugKg = sugestaoCompraKg(kg, sit.porDia, ESTOQUE_COBERTURA_DIAS);
  const diasSemContar = ult ? diasEntre(ult.data, hoje) : null;
  const corte = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
  const extrato = [
    ...compras.filter((c) => c.data_compra >= corte).map((c) => ({ d: c.data_compra, o: 1, t: `Entrada${c.fornecedor ? ' · ' + c.fornecedor : ''}`, kg: Number(c.quantidade_kg) })),
    ...consumo.map((c) => ({ d: c.data, o: 0, t: 'Ração dada aos peixes', kg: -Number(c.quantidade_kg) })),
    ...contagens.filter((c) => c.data >= corte).map((c) => ({ d: c.data, o: 2, t: Number(c.diferenca_kg) < 0 ? 'Contagem: faltou ração' : Number(c.diferenca_kg) > 0 ? 'Contagem: sobrou a mais' : 'Contagem: bateu certinho', kg: Number(c.diferenca_kg), cid: c.id })),
  ].sort((a, b) => (a.d < b.d ? 1 : a.d > b.d ? -1 : b.o - a.o));
  const sinal = (v) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${sc(Math.abs(v))}`;

  el.innerHTML = `
    <h1>Estoque de ração</h1>
    <div class="estoque-hero n-${sit.nivel}">
      <span>Em estoque agora</span>
      <b>${kg < 0 ? '−' : ''}${sc(Math.abs(kg), 0)}<em>sacos</em></b>
      <small>${fmtNum(kg, 0)} kg${sit.dias != null ? ` · dura cerca de <strong>${fmtInt(Math.floor(sit.dias))} dias</strong>` : ''}</small>
      ${sit.porDia > 0 ? `<small>Gasta ~${sc(sit.porDia)} sacos por dia (média dos últimos 7 dias)</small>` : ''}
      ${sit.nivel === 'ok' ? '' : `<p>${MENSAGEM[sit.nivel]}</p>`}
    </div>
    ${!navigator.onLine ? '<p class="aviso">Sem internet: os valores podem estar desatualizados.</p>' : ''}
    ${gerir && sugKg > 0 ? `<p class="aviso" id="sugestao-compra">Sugestão de compra: <b>~${fmtInt(Math.ceil(sugKg / kgS))} sacos</b> para a ração durar ${ESTOQUE_COBERTURA_DIAS} dias no ritmo atual.</p>` : ''}
    ${gerir && diasSemContar != null && diasSemContar >= CONTAGEM_LEMBRETE_DIAS ? `<p class="aviso" id="lembrete-contagem">A última contagem foi há ${fmtInt(diasSemContar)} dias. Contar toda semana deixa o saldo confiável.</p>` : ''}
    ${gerir ? (ult
      ? `<p class="mudo">Última contagem: ${fmtData(ult.data)} · ${Number(ult.diferenca_kg) === 0 ? 'bateu certinho' : `${Number(ult.diferenca_kg) < 0 ? 'faltaram' : 'sobraram'} ${sc(Math.abs(ult.diferenca_kg))} sacos`}</p>`
      : '<p class="aviso">Ainda não houve contagem. Não precisa contar tudo: conte por pilhas (camadas × sacos) ou espere o estoque ficar baixo, quando contar é rápido. É a contagem que deixa o saldo confiável.</p>') : ''}

    ${gerir ? `
    <details class="form-dobra dobra-passos" id="d-contagem">
      <summary>Contar o estoque no galpão</summary>
      <form id="f-contagem" class="form passos" novalidate>
        <section class="passo tipo-estoque">
          <h2 class="passo-t"><i>1</i> Conte as pilhas <small class="mudo">(ajuda opcional)</small></h2>
          <div class="pilhas" id="pilhas">
            <small class="mudo">Em cada pilha: quantas camadas de sacos e quantos sacos por camada.</small>
            <div id="pilhas-linhas"></div>
            <button type="button" class="btn mini" id="b-pilha">+ Adicionar pilha</button>
            <label>Sacos soltos ou abertos <input id="avulsos" type="number" inputmode="decimal" step="0.5" min="0" placeholder="0"></label>
            <div class="calc" id="tot-pilhas">Total das pilhas: —</div>
            <button type="button" class="btn" id="b-usar-pilhas" hidden>Usar este total</button>
          </div>
        </section>
        <section class="passo tipo-estoque">
          <h2 class="passo-t"><i>2</i> Total no galpão</h2>
          <label>Quantos sacos tem no galpão agora? <input id="contados" class="grande" type="number" inputmode="decimal" step="0.5" min="0" placeholder="0" required></label>
          <p class="ajuda">Pode ser meio saco (0,5).</p>
          <div class="calc" id="prev-cont">O sistema calcula ${sc(kg)} sacos.</div>
          <label>Observação — opcional <input id="obs" maxlength="120" placeholder="Ex.: 3 sacos molhados"></label>
        </section>
        <p id="erro-cont" class="erro" hidden></p>
        <button class="btn primario grande" type="submit">Registrar contagem</button>
      </form>
    </details>
    <details class="form-dobra dobra-passos" id="d-compra">
      <summary>Registrar compra / entrada de ração</summary>
      <form id="f-compra" class="form passos" novalidate>
        <section class="passo tipo-estoque">
          <h2 class="passo-t"><i>1</i> Quanto chegou</h2>
          <div class="duas">
            <label>Nº de sacos <input id="sacos" class="grande" type="number" inputmode="numeric" step="1" min="1" placeholder="0" required></label>
            <label>kg por saco <input id="kgsaco" type="number" inputmode="decimal" step="0.1" min="0.1" value="${kgS}" required></label>
          </div>
          <div class="calc" id="total">Total: —</div>
          <div class="data-linha"><span>Data: <b id="data-txt">hoje</b></span><button type="button" class="link" id="b-data">Mudar</button></div>
          <label id="data-wrap" hidden>Data da compra <input id="data" type="date" value="${hoje}" max="${hoje}" required></label>
        </section>
        <section class="passo tipo-estoque">
          <h2 class="passo-t"><i>2</i> Nota da compra <small class="mudo">(opcional)</small></h2>
          <label>Valor total pago (R$) <input id="custo" type="number" inputmode="decimal" step="0.01" min="0"></label>
          <label>Fornecedor <input id="forn" maxlength="80" placeholder="Ex.: Agropecuária Boa Vista"></label>
        </section>
        <p id="erro" class="erro" hidden></p>
        <button class="btn primario grande" type="submit">Registrar entrada</button>
      </form>
    </details>` : ''}

    <h2>Movimento dos últimos 30 dias</h2>
    <div class="card">
      ${extrato.length ? `<ul class="extrato">${extrato.map((x) => `<li class="${x.kg < 0 ? 'sai' : 'entra'}">
        <span class="ex-d">${fmtData(x.d).slice(0, 5)}</span><span class="ex-t">${esc(x.t)}</span>
        <b>${sinal(x.kg)}<em> sacos</em></b>
        ${x.cid && ctx.state.perfil.papel === 'dono' ? `<button class="btn mini perigo" data-delc="${esc(x.cid)}" type="button">Excluir</button>` : ''}</li>`).join('')}</ul>`
        : '<p class="mudo" style="margin:0">Nenhum movimento nos últimos 30 dias.</p>'}
    </div>

    <h2>Resumo geral</h2>
    <div class="kpis">
      <div class="kpi"><span>Comprado</span><b>${sc(comprado, 0)} sacos</b></div>
      <div class="kpi"><span>Consumido</span><b>${sc(consumido, 0)} sacos</b></div>
      ${ajustes ? `<div class="kpi" style="grid-column:1/-1"><span>Ajustes de contagem</span><b>${sinal(ajustes)} sacos</b></div>` : ''}
    </div>

    ${gerir ? `<h2>Entradas registradas</h2>
    <div class="card rolagem">
      ${compras.length ? `<table>
        <thead><tr><th>Data</th><th class="n">Sacos</th><th class="n">Valor</th><th>Fornecedor</th><th></th></tr></thead>
        <tbody>${compras.map((c) => `<tr>
          <td>${fmtData(c.data_compra)}</td><td class="n">${sc(c.quantidade_kg)}</td>
          <td class="n">${c.custo_total != null ? fmtBRL(c.custo_total) : '—'}</td>
          <td>${esc(c.fornecedor || '—')}</td>
          <td><span class="acoes-reg"><button class="btn mini" data-edit="${esc(c.id)}" type="button">Editar</button><button class="btn mini perigo" data-del="${esc(c.id)}" type="button">Excluir</button></span></td>
        </tr>`).join('')}</tbody></table>` : '<p class="mudo" style="margin:0">Nenhuma entrada registrada.</p>'}
    </div>` : ''}`;

  if (!gerir) return;

  // ---- contagem física ----
  const fc = el.querySelector('#f-contagem');
  const ec = fc.querySelector('#erro-cont');
  fc.querySelector('#contados').addEventListener('input', () => {
    const n = num(fc.querySelector('#contados').value);
    const prev = fc.querySelector('#prev-cont');
    if (!(n >= 0)) { prev.textContent = `O sistema calcula ${sc(kg)} sacos.`; return; }
    const dif = n * kgS - kg;
    prev.textContent = `O sistema calcula ${sc(kg)} sacos. ` + (Math.abs(dif) < 0.5 ? 'Bateu certinho.' : `Diferença: ${dif < 0 ? 'faltam' : 'sobram'} ${sc(Math.abs(dif))} sacos.`);
  });
  // ajuda de contagem por pilhas
  const linhas = fc.querySelector('#pilhas-linhas');
  const somaPilhas = () => {
    let t = 0, algum = false;
    linhas.querySelectorAll('.pilha').forEach((l) => {
      const c = num(l.querySelector('.p-cam').value), s = num(l.querySelector('.p-sac').value);
      const v = c > 0 && s > 0 ? c * s : 0; if (v) algum = true;
      l.querySelector('.p-tot').textContent = v ? `= ${fmtInt(v)}` : '';
      t += v;
    });
    const av = num(fc.querySelector('#avulsos').value); if (av > 0) { t += av; algum = true; }
    fc.querySelector('#tot-pilhas').textContent = algum ? `Total das pilhas: ${fmtNum(t, t % 1 ? 1 : 0)} sacos` : 'Total das pilhas: —';
    const b = fc.querySelector('#b-usar-pilhas'); b.hidden = !algum; b.dataset.total = String(t);
  };
  const addPilha = () => {
    const d = document.createElement('div'); d.className = 'pilha';
    d.innerHTML = '<label>Camadas<input class="p-cam" type="number" inputmode="numeric" min="1" step="1"></label><span>×</span><label>Sacos por camada<input class="p-sac" type="number" inputmode="numeric" min="1" step="1"></label><b class="p-tot"></b>';
    d.querySelectorAll('input').forEach((i) => i.addEventListener('input', somaPilhas));
    linhas.appendChild(d);
  };
  addPilha();
  fc.querySelector('#b-pilha').addEventListener('click', addPilha);
  fc.querySelector('#avulsos').addEventListener('input', somaPilhas);
  fc.querySelector('#b-usar-pilhas').addEventListener('click', (ev) => {
    const c = fc.querySelector('#contados'); c.value = String(Number(ev.currentTarget.dataset.total));
    c.dispatchEvent(new Event('input', { bubbles: true })); c.focus();
  });
  fc.addEventListener('submit', async (ev) => {
    ev.preventDefault(); ec.hidden = true;
    const n = num(fc.querySelector('#contados').value);
    if (!(n >= 0)) { ec.textContent = 'Informe quantos sacos você contou (pode ser 0 ou meio saco: 0,5).'; ec.hidden = false; return; }
    if (!navigator.onLine) { ec.textContent = 'Sem internet. A contagem precisa ser registrada com conexão.'; ec.hidden = false; return; }
    const dif = n * kgS - kg;
    const ok = await confirmar({
      titulo: 'Registrar contagem?',
      texto: `Você contou ${fmtNum(n, 1)} sacos. O sistema calculava ${sc(kg)}. ` + (Math.abs(dif) < 0.5 ? 'Bateu certinho.' : `O saldo será corrigido em ${dif < 0 ? '−' : '+'}${sc(Math.abs(dif))} sacos.`),
      ok: 'Registrar',
    });
    if (!ok) return;
    const btn = fc.querySelector('button[type=submit]'); btn.disabled = true;
    try {
      await ctx.api.registrarContagem(Math.round(n * kgS * 100) / 100, fc.querySelector('#obs').value.trim());
      ctx.toast('Contagem registrada', 'ok');
      renderEstoque(ctx, el);
    } catch (e) { ec.textContent = e.message; ec.hidden = false; btn.disabled = false; }
  });
  el.querySelectorAll('[data-delc]').forEach((b) => b.addEventListener('click', async () => {
    if (!(await confirmar({ titulo: 'Excluir esta contagem?', texto: 'O saldo volta ao que era antes dela.', ok: 'Excluir', perigo: true }))) return;
    try { await ctx.api.excluir('racao_contagens', b.dataset.delc); ctx.toast('Contagem excluída', 'ok'); renderEstoque(ctx, el); }
    catch (e) { ctx.toast(e.message, 'erro'); }
  }));

  // ---- compra ----
  const f = el.querySelector('#f-compra');
  const erro = f.querySelector('#erro');
  const total = () => { const s = num(f.querySelector('#sacos').value), k = num(f.querySelector('#kgsaco').value); return s > 0 && k > 0 ? s * k : null; };
  const atualiza = () => { const t = total(); f.querySelector('#total').textContent = t ? `Total: ${fmtNum(t, 1)} kg (${fmtInt(num(f.querySelector('#sacos').value))} sacos × ${fmtNum(num(f.querySelector('#kgsaco').value), 1)} kg)` : 'Total: —'; };
  f.querySelector('#sacos').addEventListener('input', atualiza);
  const dataIn = f.querySelector('#data');
  f.querySelector('#b-data').addEventListener('click', () => {
    const w = f.querySelector('#data-wrap'); w.hidden = !w.hidden;
    f.querySelector('#b-data').textContent = w.hidden ? 'Mudar' : 'Fechar';
    if (!w.hidden) dataIn.focus();
  });
  dataIn.addEventListener('input', () => { f.querySelector('#data-txt').textContent = !dataIn.value || dataIn.value === hoje ? 'hoje' : fmtData(dataIn.value); });
  f.querySelector('#kgsaco').addEventListener('input', atualiza);
  atualiza();

  f.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    erro.hidden = true;
    const falha = (m) => { erro.textContent = m; erro.hidden = false; };
    const s = num(f.querySelector('#sacos').value);
    if (!(s >= 1) || !Number.isInteger(s)) return falha('Informe o número de sacos (inteiro).');
    const t = total();
    if (!t) return falha('Informe o peso de cada saco em kg.');
    if (!f.querySelector('#data').value) return falha('Informe a data.');
    const custo = f.querySelector('#custo').value === '' ? null : num(f.querySelector('#custo').value);
    if (custo !== null && !(custo >= 0)) return falha('Valor pago inválido.');
    const btn = f.querySelector('button[type=submit]'); btn.disabled = true;
    try {
      await ctx.api.registrarCompra({
        fazenda_id: ctx.state.perfil.fazenda_id, data_compra: f.querySelector('#data').value, quantidade_kg: t,
        custo_total: custo, fornecedor: f.querySelector('#forn').value.trim() || null,
      });
      ctx.toast('Entrada registrada', 'ok');
      renderEstoque(ctx, el);
    } catch (e) { falha(e.message); btn.disabled = false; }
  });

  el.querySelectorAll('[data-del]').forEach((b) =>
    b.addEventListener('click', async () => {
      if (!(await confirmar({ titulo: 'Excluir esta entrada de ração?', texto: 'O saldo de estoque será recalculado.', ok: 'Excluir', perigo: true }))) return;
      try { await ctx.api.excluir('racao_estoque', b.dataset.del); ctx.toast('Entrada excluída', 'ok'); renderEstoque(ctx, el); }
      catch (e) { ctx.toast(e.message, 'erro'); }
    }));

  el.querySelectorAll('[data-edit]').forEach((b) =>
    b.addEventListener('click', async () => {
      if (!navigator.onLine) return ctx.toast('Sem internet', 'erro');
      const c = compras.find((x) => x.id === b.dataset.edit); if (!c) return;
      const hoje = hojeISO();
      const v = await formulario({
        titulo: 'Corrigir entrada de ração', texto: 'O saldo de estoque será recalculado.',
        campos: [
          { nome: 'data', rotulo: 'Data da compra', tipo: 'date', valor: c.data_compra, max: hoje },
          { nome: 'kg', rotulo: 'Quantidade (kg)', tipo: 'number', valor: c.quantidade_kg, step: '0.1', min: '0.1', inputmode: 'decimal', ajuda: `Hoje equivale a ${sc(c.quantidade_kg)} sacos de ${fmtNum(kgS, 0)} kg.` },
          { nome: 'custo', rotulo: 'Valor pago (R$, opcional)', tipo: 'number', valor: c.custo_total ?? '', step: '0.01', min: '0', inputmode: 'decimal' },
          { nome: 'forn', rotulo: 'Fornecedor (opcional)', tipo: 'text', valor: c.fornecedor || '', maxlength: '80' },
        ],
        validar: (x) => (!x.data ? 'Informe a data.' : x.data > hoje ? 'A data não pode ser no futuro.' : !(num(x.kg) > 0) ? 'Informe a quantidade em kg.' : x.custo !== '' && !(num(x.custo) >= 0) ? 'Valor pago inválido.' : null),
      });
      if (!v) return;
      try {
        await ctx.api.atualizar('racao_estoque', c.id, { data_compra: v.data, quantidade_kg: num(v.kg), custo_total: v.custo === '' ? null : num(v.custo), fornecedor: v.forn.trim() || null });
        ctx.toast('Entrada corrigida', 'ok'); renderEstoque(ctx, el);
      } catch (e) { ctx.toast(e.message, 'erro'); }
    }));
}
