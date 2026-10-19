// Estoque de ração: saldo (todos veem, só em kg) e compras (dono/gerente veem e lançam custo).
import { esc, fmtData, fmtNum, fmtInt, fmtBRL, hojeISO, num } from '../util.js';
import { PESO_SACO_PADRAO_KG } from '../config.js';

export async function renderEstoque(ctx, el) {
  el.innerHTML = '<h1>Estoque de ração</h1><p class="carregando">Carregando…</p>';
  const gerir = ctx.podeGerir();
  const [saldo, compras] = await Promise.all([ctx.api.saldoRacao(), ctx.api.compras(gerir)]);
  const comprado = Number(saldo?.total_comprado_kg || 0);
  const consumido = Number(saldo?.total_consumido_kg || 0);
  const kg = Number(saldo?.saldo_kg || 0);
  const hoje = hojeISO();

  el.innerHTML = `
    <h1>Estoque de ração</h1>
    <div class="kpis">
      <div class="kpi" style="grid-column:1/-1"><span>Saldo em estoque</span><b style="font-size:2rem;${kg < 0 ? 'color:var(--erro)' : ''}">${fmtNum(kg, 0)} kg</b>
        <small>≈ ${fmtNum(kg / PESO_SACO_PADRAO_KG, 1)} sacos de ${PESO_SACO_PADRAO_KG} kg</small></div>
      <div class="kpi"><span>Total comprado</span><b>${fmtNum(comprado, 0)} kg</b></div>
      <div class="kpi"><span>Total consumido</span><b>${fmtNum(consumido, 0)} kg</b></div>
    </div>
    ${kg < 0 ? '<p class="erro">O consumo registrado é maior que as compras. Confira se falta lançar alguma compra (ou o estoque que já existia).</p>' : ''}
    ${!compras.length ? `<p class="aviso">Para começar, registre o estoque que você já tem hoje como uma compra (fornecedor: “Estoque inicial”). Sem isso o saldo fica errado.</p>` : ''}
    ${!navigator.onLine ? '<p class="aviso">Sem internet: os valores podem estar desatualizados.</p>' : ''}

    ${gerir ? `
    <form id="f-compra" class="card form" novalidate>
      <h3>Registrar compra / entrada de ração</h3>
      <label>Data <input id="data" type="date" value="${hoje}" max="${hoje}" required></label>
      <div class="duas">
        <label>Nº de sacos <input id="sacos" type="number" inputmode="numeric" step="1" min="1" required></label>
        <label>kg por saco <input id="kgsaco" type="number" inputmode="decimal" step="0.1" min="0.1" value="${PESO_SACO_PADRAO_KG}" required></label>
      </div>
      <div class="calc" id="total">Total: —</div>
      <label>Valor total pago (R$) — opcional <input id="custo" type="number" inputmode="decimal" step="0.01" min="0"></label>
      <label>Fornecedor — opcional <input id="forn" maxlength="80" placeholder="Ex.: Agropecuária Boa Vista"></label>
      <p id="erro" class="erro" hidden></p>
      <button class="btn primario" type="submit">Registrar entrada</button>
    </form>` : ''}

    <h2>Entradas registradas</h2>
    <div class="card rolagem">
      ${compras.length ? `<table>
        <thead><tr><th>Data</th><th class="n">kg</th>${gerir ? '<th class="n">Valor</th>' : ''}<th>Fornecedor</th>${gerir ? '<th></th>' : ''}</tr></thead>
        <tbody>${compras.map((c) => `<tr>
          <td>${fmtData(c.data_compra)}</td><td class="n">${fmtNum(c.quantidade_kg, 0)}</td>
          ${gerir ? `<td class="n">${c.custo_total != null ? fmtBRL(c.custo_total) : '—'}</td>` : ''}
          <td>${esc(c.fornecedor || '—')}</td>
          ${gerir ? `<td><button class="btn mini perigo" data-del="${esc(c.id)}" type="button">Excluir</button></td>` : ''}
        </tr>`).join('')}</tbody></table>` : '<p class="mudo" style="margin:0">Nenhuma entrada registrada.</p>'}
    </div>`;

  if (!gerir) return;
  const f = el.querySelector('#f-compra');
  const erro = f.querySelector('#erro');
  const total = () => { const s = num(f.querySelector('#sacos').value), k = num(f.querySelector('#kgsaco').value); return s > 0 && k > 0 ? s * k : null; };
  const atualiza = () => { const t = total(); f.querySelector('#total').textContent = t ? `Total: ${fmtNum(t, 1)} kg (${fmtInt(num(f.querySelector('#sacos').value))} sacos × ${fmtNum(num(f.querySelector('#kgsaco').value), 1)} kg)` : 'Total: —'; };
  f.querySelector('#sacos').addEventListener('input', atualiza);
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
      if (!confirm('Excluir esta entrada de ração? O saldo será recalculado.')) return;
      try { await ctx.api.excluir('racao_estoque', b.dataset.del); ctx.toast('Entrada excluída', 'ok'); renderEstoque(ctx, el); }
      catch (e) { ctx.toast(e.message, 'erro'); }
    }));
}
