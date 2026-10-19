// Equipe (somente dono): vincular pessoas, definir papel, liberar tanques, desativar acesso.
import { esc, ROTULO_PAPEL } from '../util.js';

export async function renderEquipe(ctx, el) {
  if (ctx.state.perfil.papel !== 'dono') { el.innerHTML = '<div class="card vazio">Somente o dono gerencia a equipe.</div>'; return; }
  el.innerHTML = '<h1>Equipe</h1><p class="carregando">Carregando…</p>';
  const [{ usuarios, vinculos }, tanques] = await Promise.all([ctx.api.equipe(), ctx.api.tanques()]);
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
          ${u.papel !== 'dono' ? `<small class="mudo"> · ${meus.size} tanque(s)</small>` : ''}</summary>
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
    <form id="f-novo" class="card form" novalidate>
      <p class="mudo" style="margin:0">O login (e-mail e senha) precisa existir antes — peça ao administrador do sistema para criar. Depois, vincule aqui:</p>
      <label>E-mail do login <input name="email" type="email" inputmode="email" autocapitalize="none" required></label>
      <label>Nome <input name="nome" maxlength="80" required></label>
      <label>Papel <select name="papel"><option value="funcionario">Funcionário</option><option value="gerente">Gerente</option></select></label>
      <p id="erro-novo" class="erro" hidden></p>
      <button class="btn primario" type="submit">Vincular à fazenda</button>
    </form>`;

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
    } catch (e) { erroNovo.textContent = e.message; erroNovo.hidden = false; btn.disabled = false; }
  });
}
