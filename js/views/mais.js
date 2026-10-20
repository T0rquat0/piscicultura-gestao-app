import { esc, ROTULO_PAPEL, fmtData, hojeISO, diasEntre } from '../util.js';
import { icone } from '../icons.js';
import { num, fmtNum } from '../util.js';
import { PESO_SACO_PADRAO_KG } from '../config.js';

export function renderMais(ctx, el) {
  const { state } = ctx;
  const p = state.perfil;
  const gerir = ctx.podeGerir();
  const itens = [
    gerir && ['#/tanques', 'tanque', 'Tanques e lotes', 'Cadastrar tanques e lotes de peixes'],
    ['#/estoque', 'estoque', 'Estoque de ração', gerir ? 'Saldo, compras e custos' : 'Saldo de ração'],
    p.papel === 'dono' && ['#/equipe', 'equipe', 'Equipe', 'Pessoas, papéis e tanques liberados'],
    ['#/pendencias', 'pendentes', 'Pendentes de envio', state.pendentes ? `${state.pendentes} aguardando envio` : 'Nada pendente'],
  ].filter(Boolean);

  el.innerHTML = `
    <h1>Mais</h1>
    <div class="card"><ul class="lista">${itens.map(([href, ic, t, s]) => `
      <li><a class="item" href="${href}"><span class="item-ic">${icone(ic)}</span><span class="esq"><b>${esc(t)}</b><small>${esc(s)}</small></span><span class="seta">${icone('direita', 20)}</span></a></li>`).join('')}</ul></div>

    <div class="card">
      <b>${esc(p.nome)}</b>
      <small style="display:block">${esc(ROTULO_PAPEL[p.papel] || p.papel)} · ${esc((p.fazendas && p.fazendas.nome) || '')}</small>
      <div class="acoes">
        <button class="btn" id="b-atualizar" type="button">Atualizar dados</button>
        <button class="btn perigo" id="b-sair" type="button">Sair</button>
      </div>
    </div>

    <div id="teste"></div>

    ${p.papel === 'dono' ? `<div class="card">
      <b>Peso do saco de ração</b>
      <small style="display:block">Usado para converter sacos em kg ao lançar a ração.</small>
      <form id="f-saco" class="duas" style="margin-top:10px"><label>kg por saco <input id="kgsaco" type="number" inputmode="decimal" step="0.1" min="1" value="${state.ref.kgSaco || PESO_SACO_PADRAO_KG}" required></label>
      <button class="btn" type="submit">Salvar</button></form></div>` : ''}

    <details class="card">
      <summary>Como instalar no celular</summary>
      <p><b>Android (Chrome):</b> menu (três pontos) → “Instalar app” ou “Adicionar à tela inicial”.</p>
      <p><b>iPhone (Safari):</b> botão Compartilhar → “Adicionar à Tela de Início”.</p>
      <p class="mudo">Instalar é importante: no iPhone, lançamentos guardados sem internet podem ser apagados pelo sistema se o app não estiver instalado.</p>
    </details>`;

  const fs = el.querySelector('#f-saco');
  if (fs) fs.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const kg = num(fs.querySelector('#kgsaco').value);
    if (!(kg >= 1 && kg <= 100)) return ctx.toast('Informe o peso do saco em kg (ex.: 25).', 'erro');
    if (!navigator.onLine) return ctx.toast('Sem internet', 'erro');
    try {
      await ctx.api.salvarKgSaco(state.perfil.fazenda_id, kg);
      if (!(await ctx.api.kgSaco())) return ctx.toast('Falta rodar o sql/03 no Supabase.', 'erro');
      await ctx.atualizarRef(true);
      ctx.toast(`Saco = ${fmtNum(kg, 0)} kg`, 'ok');
    } catch (e) { ctx.toast('Não salvou: ' + e.message, 'erro'); }
  });
  el.querySelector('#b-atualizar').addEventListener('click', async () => {
    if (!navigator.onLine) return ctx.toast('Sem internet', 'erro');
    await ctx.atualizarRef(true);
    await ctx.sincronizarAgora(true);
    ctx.toast('Dados atualizados', 'ok');
  });
  el.querySelector('#b-sair').addEventListener('click', () => ctx.sair());
  if (p.papel === 'dono' && navigator.onLine) {
    ctx.api.testeAte().then((ate) => {
      if (!ate) return;
      const falta = diasEntre(hojeISO(), ate);
      el.querySelector('#teste').innerHTML = `<div class="card"><b>${falta >= 0 ? 'Período de teste grátis' : 'Período de teste terminou'}</b>
        <small style="display:block">${falta > 0 ? `Faltam ${falta} dia(s): vai até ${fmtData(ate)}.` : falta === 0 ? 'Termina hoje.' : `Terminou em ${fmtData(ate)}.`}</small></div>`;
    }).catch(() => {});
  }
}
