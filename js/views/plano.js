// Meu plano (somente dono): pacote de tanques, prazo e contratação.
import { esc, fmtBRL, fmtData, hojeISO, diasEntre } from '../util.js';
import { confirmar } from '../dialogo.js';

export async function renderPlano(ctx, el) {
  if (ctx.state.perfil.papel !== 'dono') { el.innerHTML = '<div class="card vazio">Somente o dono vê o plano.</div>'; return; }
  el.innerHTML = '<p><a class="voltar" href="#/mais">← Mais</a></p><h1>Meu plano</h1><p class="carregando">Carregando…</p>';
  if (!navigator.onLine) { el.innerHTML = '<p><a class="voltar" href="#/mais">← Mais</a></p><h1>Meu plano</h1><div class="card vazio">Precisa de internet.</div>'; return; }
  const [plano, pacotes] = await Promise.all([ctx.api.plano(), ctx.api.pacotes()]);
  if (!plano) { el.innerHTML = '<p><a class="voltar" href="#/mais">← Mais</a></p><h1>Meu plano</h1><div class="card vazio">Os planos ainda não foram ativados neste sistema.</div>'; return; }

  const dias = plano.valido_ate ? diasEntre(hojeISO(), plano.valido_ate) : null;
  const TXT = {
    teste: ['Período de teste grátis', dias != null ? (dias > 0 ? `${dias === 1 ? 'Falta 1 dia' : `Faltam ${dias} dias`}, até ${fmtData(plano.valido_ate)}. Durante o teste não há limite de tanques.` : 'Termina hoje.') : ''],
    teste_acabou: ['Seu teste terminou', 'Escolha um pacote para voltar a abrir lotes. Seus dados continuam aqui e os lançamentos seguem funcionando.'],
    ativo: ['Plano ativo', `Pago até ${fmtData(plano.valido_ate)}${dias != null ? ` (${dias === 1 ? 'falta 1 dia' : `faltam ${dias} dias`})` : ''}.`],
    carencia: ['Plano vencido (carência)', `Venceu em ${fmtData(plano.valido_ate)}. Renove para continuar abrindo lotes novos.`],
    vencido: ['Plano vencido', `Venceu em ${fmtData(plano.valido_ate)}. Renove para abrir lotes novos. Os lançamentos continuam funcionando.`],
    livre: ['Sem limite de tanques', 'Sua fazenda não tem pacote contratado.'],
  }[plano.estado] || ['Plano', ''];
  const alerta = ['carencia', 'vencido', 'teste_acabou'].includes(plano.estado);
  const lim = plano.limite;

  el.innerHTML = `
    <p><a class="voltar" href="#/mais">← Mais</a></p>
    <h1>Meu plano</h1>
    <div class="card plano-estado${alerta ? ' alerta' : ''}">
      <b>${esc(TXT[0])}</b><small style="display:block">${esc(TXT[1])}</small>
      ${lim != null && plano.estado !== 'teste_acabou' ? `<p style="margin:.8rem 0 0"><b>${plano.em_uso} de ${lim}</b> ${lim === 1 ? 'tanque' : 'tanques'} em uso</p>
        <div class="barra-uso"><span style="width:${Math.min(100, Math.round((plano.em_uso / Math.max(lim, 1)) * 100))}%"></span></div>` : `<p style="margin:.8rem 0 0"><b>${plano.em_uso}</b> ${plano.em_uso === 1 ? 'tanque' : 'tanques'} em uso</p>`}
      ${plano.proximo_tanques_max ? `<small style="display:block;margin-top:.5rem">Na próxima renovação: pacote de ${plano.proximo_tanques_max} tanques.</small>` : ''}
    </div>
    <p class="mudo nota">Tanque em uso é o que tem um lote ativo. Tanque sem lote não conta.</p>
    ${plano.piloto ? '<p class="aviso">Modo piloto: ao escolher um pacote, ele é liberado na hora, sem cobrança.</p>' : ''}
    <h2>Pacotes</h2>
    <div id="pacotes">${pacotes.map((p) => {
      const atual = lim === p.tanques_max && plano.estado !== 'teste_acabou';
      const pequeno = p.tanques_max < plano.em_uso;
      return `<div class="card pacote${atual ? ' atual' : ''}"><span class="esq"><b>${esc(p.nome)}</b><small>${fmtBRL(p.preco_mensal)} por mês</small></span>
        ${atual ? '<span class="tag ok">Seu pacote</span>' : `<button class="btn ${pequeno ? '' : 'primario'}" type="button" data-n="${p.tanques_max}" ${pequeno ? 'disabled' : ''}>${pequeno ? `Você usa ${plano.em_uso}` : lim != null && p.tanques_max < lim ? 'Reduzir' : 'Contratar'}</button>`}</div>`;
    }).join('') || '<div class="card vazio">Nenhum pacote disponível.</div>'}</div>
    <p class="mudo nota">Precisa de mais de ${pacotes.length ? pacotes[pacotes.length - 1].tanques_max : 30} tanques? Fale com a gente.</p>`;

  el.querySelectorAll('[data-n]').forEach((b) => b.addEventListener('click', async () => {
    const n = Number(b.dataset.n); const p = pacotes.find((x) => x.tanques_max === n);
    const reduz = lim != null && n < lim && plano.estado === 'ativo';
    if (!(await confirmar({ titulo: reduz ? `Reduzir para ${p.nome.toLowerCase()}?` : `Contratar ${p.nome.toLowerCase()}?`, texto: reduz ? `O pacote atual vale até ${fmtData(plano.valido_ate)}. O novo começa na próxima renovação.` : `${fmtBRL(p.preco_mensal)} por mês.${plano.piloto ? ' Modo piloto: liberado agora, sem cobrança.' : ''}`, ok: reduz ? 'Reduzir' : 'Contratar', cancelar: 'Voltar' }))) return;
    b.disabled = true;
    try {
      const r = await ctx.api.contratarPacote(n);
      ctx.toast(r.acao === 'liberado' ? 'Pacote liberado' : r.acao === 'agendado' ? 'Redução agendada' : 'Cobrança criada. O pagamento ainda não está disponível no app: fale com a gente.', 'ok');
      renderPlano(ctx, el);
    } catch (e) { ctx.toast(e.message, 'erro'); b.disabled = false; }
  }));
}
