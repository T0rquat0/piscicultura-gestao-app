// Lançamentos guardados no aparelho que ainda não chegaram ao servidor.
import { esc, fmtData, fmtNum } from '../util.js';
import * as db from '../db.js';

const ROTULO = { racao_consumo: 'Ração', biometrias: 'Biometria', mortalidade: 'Mortalidade' };

function descricao(it, ref) {
  const p = it.payload;
  const lote = ref.lotes.find((l) => l.id === p.lote_id);
  const tanqueId = p.tanque_id || (lote && lote.tanque_id);
  const tanque = ref.tanques.find((t) => t.id === tanqueId);
  let valor = '';
  if (it.tabela === 'racao_consumo') valor = `${fmtNum(p.quantidade_kg, 2)} kg`;
  else if (it.tabela === 'biometrias') valor = `${fmtNum(p.peso_amostra_kg, 3)} kg em ${p.quantidade_amostrada} peixe(s) (médio ${fmtNum((p.peso_amostra_kg / p.quantidade_amostrada) * 1000, 0)} g)`;
  else valor = `${p.quantidade} peixe(s)`;
  return { titulo: `${ROTULO[it.tabela] || it.tabela} · ${tanque ? tanque.nome : 'tanque'}`, sub: `${fmtData(p.data)} · ${valor}` };
}

export async function renderPendencias(ctx, el) {
  const meuId = ctx.state.perfil.id;
  const todos = await db.filaList();
  const meus = todos.filter((i) => i.registrado_por === meuId);
  const outros = todos.length - meus.length;

  el.innerHTML = `
    <h1>Pendentes de envio</h1>
    ${outros ? `<p class="aviso">Há ${outros} lançamento(s) de outro usuário neste aparelho. Eles serão enviados quando essa pessoa entrar.</p>` : ''}
    ${meus.length ? `
      <div class="acoes" style="margin:0 0 .8rem"><button class="btn primario" id="b-enviar" type="button"${navigator.onLine ? '' : ' disabled'}>Enviar agora</button></div>
      ${navigator.onLine ? '' : '<p class="aviso">Sem internet. Os lançamentos serão enviados assim que a conexão voltar.</p>'}
      <div class="card"><ul class="lista">${meus.map((it) => {
        const d = descricao(it, ctx.state.ref);
        return `<li><div class="esq"><b>${esc(d.titulo)}</b><small>${esc(d.sub)}</small>
          ${it.status === 'erro' ? `<small style="color:var(--erro)">Não enviado: ${esc(it.erro || 'erro')}</small>` : '<small>Aguardando envio</small>'}</div>
          <button class="btn mini perigo" data-descartar="${esc(it.uuid_local)}" type="button">Descartar</button></li>`;
      }).join('')}</ul></div>`
      : '<div class="card vazio"><p>Tudo enviado.<br>Nenhum lançamento pendente.</p></div>'}`;

  const enviar = el.querySelector('#b-enviar');
  if (enviar) enviar.addEventListener('click', async () => {
    enviar.disabled = true; enviar.textContent = 'Enviando…';
    const r = await ctx.sincronizarAgora(true);
    if (r && r.semRede) ctx.toast('Sem conexão com o servidor', 'erro');
    renderPendencias(ctx, el);
  });
  el.querySelectorAll('[data-descartar]').forEach((b) =>
    b.addEventListener('click', async () => {
      if (!confirm('Descartar este lançamento? Ele NÃO será enviado e não poderá ser recuperado.')) return;
      await db.filaRemove(b.dataset.descartar);
      await ctx.atualizarPendentes();
      renderPendencias(ctx, el);
    }));
}
