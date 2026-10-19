import { esc, ROTULO_PAPEL } from '../util.js';

export function renderMais(ctx, el) {
  const { state } = ctx;
  const p = state.perfil;
  const gerir = ctx.podeGerir();
  const itens = [
    gerir && ['#/tanques', '🛢️', 'Tanques e lotes', 'Cadastrar tanques e lotes de peixes'],
    ['#/estoque', '📦', 'Estoque de ração', gerir ? 'Saldo, compras e custos' : 'Saldo de ração'],
    p.papel === 'dono' && ['#/equipe', '👥', 'Equipe', 'Pessoas, papéis e tanques liberados'],
    ['#/pendencias', '🔄', 'Pendentes de envio', state.pendentes ? `${state.pendentes} aguardando envio` : 'Nada pendente'],
  ].filter(Boolean);

  el.innerHTML = `
    <h1>Mais</h1>
    <div class="card"><ul class="lista">${itens.map(([href, ic, t, s]) => `
      <li><a class="esq" href="${href}"><b>${ic} ${esc(t)}</b><small>${esc(s)}</small></a><span class="mudo">›</span></li>`).join('')}</ul></div>

    <div class="card">
      <b>${esc(p.nome)}</b>
      <small style="display:block">${esc(ROTULO_PAPEL[p.papel] || p.papel)} · ${esc((p.fazendas && p.fazendas.nome) || '')}</small>
      <div class="acoes">
        <button class="btn" id="b-atualizar" type="button">Atualizar dados</button>
        <button class="btn perigo" id="b-sair" type="button">Sair</button>
      </div>
    </div>

    <details class="card">
      <summary>Como instalar no celular</summary>
      <p><b>Android (Chrome):</b> menu ⋮ → “Instalar app” ou “Adicionar à tela inicial”.</p>
      <p><b>iPhone (Safari):</b> botão Compartilhar → “Adicionar à Tela de Início”.</p>
      <p class="mudo">Instalar é importante: no iPhone, lançamentos guardados sem internet podem ser apagados pelo sistema se o app não estiver instalado.</p>
    </details>`;

  el.querySelector('#b-atualizar').addEventListener('click', async () => {
    if (!navigator.onLine) return ctx.toast('Sem internet', 'erro');
    await ctx.atualizarRef(true);
    await ctx.sincronizarAgora(true);
    ctx.toast('Dados atualizados ✔', 'ok');
  });
  el.querySelector('#b-sair').addEventListener('click', () => ctx.sair());
}
