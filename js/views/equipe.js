// Equipe (somente dono): vincular pessoas, definir papel, liberar tanques, desativar acesso.
import { esc, fmtData, ROTULO_PAPEL, plural } from '../util.js';
import { confirmar } from '../dialogo.js';

export async function renderEquipe(ctx, el) {
  if (ctx.state.perfil.papel !== 'dono') { el.innerHTML = '<div class="card vazio">Somente o dono gerencia a equipe.</div>'; return; }
  el.innerHTML = '<h1>Equipe</h1><p class="carregando">Carregando…</p>';
  const [{ usuarios, vinculos }, tanques, convites] = await Promise.all([ctx.api.equipe(), ctx.api.tanques(), ctx.api.convitesAbertos()]);
  const linkDe = (token) => `${location.origin}${location.pathname}#/convite/${token}`;
  const meuId = ctx.state.perfil.id;

  el.innerHTML = `
    <h1>Equipe</h1>
    ${!navigator.onLine ? '<p class="aviso">Sem internet: a equipe só pode ser alterada com conexão.</p>' : ''}
    ${usuarios.map((u) => {
      const meus = new Set(vinculos.filter((v) => v.usuario_id === u.id).map((v) => v.tanque_id));
      const eu = u.id === meuId;
      return `<details class="card" data-uid="${esc(u.id)}">
        <summary>${esc(u.nome)} <span class="tag">${esc(ROTULO_PAPEL[u.papel] || u.papel)}</span>
          ${u.ativo ? '' : '<span class="tag erro">Desativado</span>'}
          ${u.papel !== 'dono' ? `<small class="mudo"> · ${plural(meus.size, 'tanque', 'tanques')}</small>` : ''}</summary>
        ${eu ? '<p class="mudo">Este é o seu usuário.</p>' : `
        <form class="form" data-form="${esc(u.id)}" novalidate>
          <label>Papel
            <select name="papel">
              ${['gerente', 'funcionario'].map((p) => `<option value="${p}"${u.papel === p ? ' selected' : ''}>${ROTULO_PAPEL[p]}</option>`).join('')}
              ${u.papel === 'dono' ? '<option value="dono" selected>Dono</option>' : ''}
            </select></label>
          <div><b>Tanques liberados</b>
            ${tanques.length ? tanques.map((t) => `<label class="linha-check"><input type="checkbox" name="tanque" value="${esc(t.id)}"${meus.has(t.id) ? ' checked' : ''}> ${esc(t.nome)}</label>`).join('') : '<p class="mudo">Nenhum tanque cadastrado.</p>'}
          </div>
          <label class="linha-check"><input type="checkbox" name="ativo"${u.ativo ? ' checked' : ''}> Acesso ativo</label>
          <p class="erro" data-erro hidden></p>
          <button class="btn primario" type="submit">Salvar</button>
        </form>`}
      </details>`;
    }).join('')}

    <h2>Adicionar pessoa</h2>
    ${convites ? `<div class="card form" id="convite">
      <b>Convidar por link</b>
      <p class="mudo" style="margin:0">Gere um link e mande pelo WhatsApp. A pessoa cria a conta (ou entra com a que já tem) e fica ligada a esta fazenda. Cada link serve para uma pessoa e vale 7 dias.</p>
      <label>Papel <select id="conv-papel"><option value="funcionario">Funcionário</option><option value="gerente">Gerente</option></select></label>
      <button class="btn primario" id="b-convite" type="button">Gerar link de convite</button>
      <div id="conv-novo" hidden>
        <input id="conv-link" type="text" readonly>
        <div class="acoes"><button class="btn" id="b-copiar" type="button">Copiar link</button><a class="btn primario" id="b-whats" target="_blank" rel="noopener">Enviar no WhatsApp</a></div>
      </div>
      <p id="erro-conv" class="erro" hidden></p>
      ${convites.length ? `<div><b>Convites em aberto</b><ul class="lista">${convites.map((c) => `<li><div class="esq"><b>${esc(ROTULO_PAPEL[c.papel] || c.papel)}</b><small>gerado em ${fmtData(c.criado_em)} · vale até ${fmtData(c.expira_em)}</small></div>
        <span class="acoes-reg"><button class="btn mini" data-copiar="${esc(c.token)}" type="button">Copiar</button><button class="btn mini perigo" data-cancelar-conv="${esc(c.token)}" type="button">Cancelar</button></span></li>`).join('')}</ul></div>` : ''}
      <p class="mudo" style="margin:0">Depois que a pessoa entrar, ela aparece na lista acima: libere os tanques dela.</p>
    </div>` : ''}
    <details class="avancado"${convites ? '' : ' open'}><summary>${convites ? 'A pessoa já tem conta? Vincular pelo e-mail' : 'Vincular pelo e-mail'}</summary>
    <form id="f-novo" class="card form" novalidate>
      <p class="mudo" style="margin:0">Primeiro a pessoa cria a própria conta no app, na tela de entrada (botão <b>Criar conta da minha fazenda</b>), com o e-mail dela, e confirma pelo e-mail recebido. Ela para na tela "Cadastre sua fazenda": não precisa preencher. Depois, vincule aqui com o mesmo e-mail:</p>
      <label>E-mail do login <input name="email" type="email" inputmode="email" autocapitalize="none" required></label>
      <label>Nome <input name="nome" maxlength="80" required></label>
      <label>Papel <select name="papel"><option value="funcionario">Funcionário</option><option value="gerente">Gerente</option></select></label>
      <p id="erro-novo" class="erro" hidden></p>
      <button class="btn primario" type="submit">Vincular à fazenda</button>
    </form></details>`;

  // ---- convite por link ----
  const copiar = async (texto) => {
    try { await navigator.clipboard.writeText(texto); ctx.toast('Link copiado', 'ok'); }
    catch { ctx.toast('Não deu para copiar. Segure o dedo no link e copie.', 'erro'); }
  };
  const bc = el.querySelector('#b-convite');
  if (bc) bc.addEventListener('click', async () => {
    const erro = el.querySelector('#erro-conv'); erro.hidden = true;
    if (!navigator.onLine) { erro.textContent = 'Sem internet.'; erro.hidden = false; return; }
    const papel = el.querySelector('#conv-papel').value;
    bc.disabled = true;
    try {
      const link = linkDe(await ctx.api.criarConvite(papel));
      const fazenda = (ctx.state.perfil.fazendas && ctx.state.perfil.fazendas.nome) || 'nossa fazenda';
      const msg = `Olá! Este é o seu convite para entrar na ${fazenda} no app de gestão da piscicultura, como ${ROTULO_PAPEL[papel].toLowerCase()}. Abra o link, crie sua conta (ou entre) e pronto: ${link}`;
      el.querySelector('#conv-link').value = link;
      el.querySelector('#b-whats').href = `https://wa.me/?text=${encodeURIComponent(msg)}`;
      el.querySelector('#conv-novo').hidden = false;
      el.querySelector('#b-copiar').onclick = () => copiar(link);
      bc.textContent = 'Gerar outro link';
    } catch (e) { erro.textContent = e.message; erro.hidden = false; }
    bc.disabled = false;
  });
  el.querySelectorAll('[data-copiar]').forEach((b) => b.addEventListener('click', () => copiar(linkDe(b.dataset.copiar))));
  el.querySelectorAll('[data-cancelar-conv]').forEach((b) => b.addEventListener('click', async () => {
    if (!(await confirmar({ titulo: 'Cancelar este convite?', texto: 'O link deixa de funcionar. Quem já entrou continua na equipe.', ok: 'Cancelar convite', cancelar: 'Voltar', perigo: true }))) return;
    try { await ctx.api.cancelarConvite(b.dataset.cancelarConv); ctx.toast('Convite cancelado', 'ok'); renderEquipe(ctx, el); }
    catch (e) { ctx.toast(e.message, 'erro'); }
  }));

  el.querySelectorAll('form[data-form]').forEach((f) =>
    f.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const uid = f.dataset.form;
      const u = usuarios.find((x) => x.id === uid);
      const erro = f.querySelector('[data-erro]'); erro.hidden = true;
      const antes = new Set(vinculos.filter((v) => v.usuario_id === uid).map((v) => v.tanque_id));
      const depois = new Set([...f.querySelectorAll('input[name=tanque]:checked')].map((i) => i.value));
      const adicionar = [...depois].filter((t) => !antes.has(t));
      const remover = [...antes].filter((t) => !depois.has(t));
      const campos = {};
      if (f.querySelector('[name=papel]').value !== u.papel) campos.papel = f.querySelector('[name=papel]').value;
      if (f.querySelector('[name=ativo]').checked !== u.ativo) campos.ativo = f.querySelector('[name=ativo]').checked;
      const btn = f.querySelector('button'); btn.disabled = true;
      try {
        if (Object.keys(campos).length) await ctx.api.atualizarUsuario(uid, campos);
        await ctx.api.salvarVinculos(uid, adicionar, remover);
        ctx.toast('Equipe atualizada', 'ok');
        renderEquipe(ctx, el);
      } catch (e) { erro.textContent = e.message; erro.hidden = false; btn.disabled = false; }
    }));

  const fn = el.querySelector('#f-novo');
  const erroNovo = fn.querySelector('#erro-novo');
  fn.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    erroNovo.hidden = true;
    const email = fn.querySelector('[name=email]').value.trim(), nome = fn.querySelector('[name=nome]').value.trim();
    if (!email || !nome) { erroNovo.textContent = 'Informe e-mail e nome.'; erroNovo.hidden = false; return; }
    const btn = fn.querySelector('button'); btn.disabled = true;
    try {
      await ctx.api.adicionarUsuario(email, nome, fn.querySelector('[name=papel]').value);
      ctx.toast('Pessoa vinculada. Agora libere os tanques dela.', 'ok');
      renderEquipe(ctx, el);
    } catch (e) {
      erroNovo.textContent = /Nenhum login encontrado/i.test(e.message) ? 'Nenhuma conta com este e-mail. Peça para a pessoa abrir o app, tocar em "Criar conta da minha fazenda" com este e-mail e confirmar pelo e-mail recebido. Depois tente de novo.' : e.message;
      erroNovo.hidden = false; btn.disabled = false;
    }
  });
}
