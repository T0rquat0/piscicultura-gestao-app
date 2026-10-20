import { esc } from '../util.js';
import { icone } from '../icons.js';

export function renderLogin(ctx, root, aviso) {
  const pend = ctx.state.pendentes || 0;
  root.innerHTML = `
  <main class="login">
    <div class="login-card">
      <div class="logo">${icone('peixe', 44)}</div>
      <h1>Gestão de Piscicultura</h1>
      ${aviso ? `<p class="aviso">${esc(aviso)}</p>` : ''}
      <form id="f-login" class="form" novalidate>
        <label>E-mail <input id="email" type="email" autocomplete="username" inputmode="email" autocapitalize="none" required></label>
        <label>Senha <input id="senha" type="password" autocomplete="current-password" required></label>
        <p id="erro" class="erro" hidden></p>
        <button class="btn primario grande" type="submit">Entrar</button>
      </form>
      <p style="margin-top:1rem;text-align:center"><button class="link" id="b-esqueci" type="button">Esqueci minha senha</button></p>
      <p style="margin-top:1.2rem"><button class="btn" id="b-criar" type="button">Criar conta da minha fazenda</button></p>
      ${pend ? `<p class="aviso">Há ${pend} lançamento(s) salvo(s) neste aparelho aguardando envio. Entre para enviar.</p>` : ''}
      ${navigator.onLine ? '' : '<p class="aviso">Sem internet. O primeiro acesso precisa de conexão.</p>'}
    </div>
  </main>`;
  root.querySelector('#b-esqueci').addEventListener('click', () => ctx.mostrarRecuperar());
  root.querySelector('#b-criar').addEventListener('click', () => ctx.mostrarCadastro());
  const f = root.querySelector('#f-login');
  const erro = root.querySelector('#erro');
  f.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const email = f.querySelector('#email').value.trim();
    const senha = f.querySelector('#senha').value;
    erro.hidden = true;
    if (!email || !senha) { erro.textContent = 'Informe e-mail e senha.'; erro.hidden = false; return; }
    const btn = f.querySelector('button');
    btn.disabled = true; btn.textContent = 'Entrando…';
    try {
      await ctx.entrar(email, senha);
    } catch (e) {
      erro.textContent = e.message || 'Não foi possível entrar.';
      erro.hidden = false;
      btn.disabled = false; btn.textContent = 'Entrar';
    }
  });
}
