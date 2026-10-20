// Cadastro do dono: criar conta (e-mail + senha) e depois a fazenda.
import { esc } from '../util.js';
import { icone } from '../icons.js';
import { TESTE_DIAS } from '../config.js';

const cabeca = (t, sub) => `<div class="logo">${icone('peixe', 44)}</div><h1>${esc(t)}</h1>${sub ? `<p class="mudo" style="margin:-1rem 0 1.4rem">${sub}</p>` : ''}`;

export function renderCadastro(ctx, root) {
  root.innerHTML = `
  <main class="login"><div class="login-card">
    ${cabeca('Criar minha conta', `Teste grátis por ${TESTE_DIAS} dias. Sem cartão.`)}
    <form id="f-cad" class="form" novalidate>
      <label>E-mail <input id="email" type="email" autocomplete="username" inputmode="email" autocapitalize="none" required></label>
      <label>Crie uma senha <input id="senha" type="password" autocomplete="new-password" minlength="8" required><small class="mudo">Pelo menos 8 caracteres.</small></label>
      <p id="erro" class="erro" hidden></p>
      <p id="ok" class="aviso" hidden></p>
      <button class="btn primario grande" type="submit">Criar conta</button>
    </form>
    <p style="margin-top:1.2rem"><button class="btn" id="b-voltar" type="button">Já tenho conta</button></p>
    ${navigator.onLine ? '' : '<p class="aviso">Sem internet. Para criar a conta é preciso estar conectado.</p>'}
  </div></main>`;
  const f = root.querySelector('#f-cad'), erro = root.querySelector('#erro'), okp = root.querySelector('#ok');
  root.querySelector('#b-voltar').addEventListener('click', () => ctx.mostrarLogin());
  f.addEventListener('submit', async (ev) => {
    ev.preventDefault(); erro.hidden = true; okp.hidden = true;
    const email = f.querySelector('#email').value.trim(), senha = f.querySelector('#senha').value;
    const falha = (m) => { erro.textContent = m; erro.hidden = false; };
    if (!/^\S+@\S+\.\S+$/.test(email)) return falha('Informe um e-mail válido.');
    if (senha.length < 8) return falha('A senha precisa ter pelo menos 8 caracteres.');
    const btn = f.querySelector('button[type=submit]'); btn.disabled = true; btn.textContent = 'Criando…';
    try {
      const r = await ctx.cadastrar(email, senha);
      if (r === 'confirmar') {
        okp.textContent = 'Enviamos um e-mail para confirmar sua conta. Abra o e-mail, toque no link e depois volte aqui para entrar.';
        okp.hidden = false; btn.textContent = 'Criar conta';
      }
    } catch (e) { falha(e.message || 'Não foi possível criar a conta.'); btn.disabled = false; btn.textContent = 'Criar conta'; }
  });
}

// Conta criada, mas ainda sem fazenda.
export function renderCriarFazenda(ctx, root, user) {
  root.innerHTML = `
  <main class="login"><div class="login-card">
    ${cabeca('Cadastre sua fazenda', `Você terá ${TESTE_DIAS} dias de teste grátis.`)}
    <form id="f-faz" class="form" novalidate>
      <label>Nome da fazenda <input id="fazenda" type="text" maxlength="80" autocomplete="organization" required></label>
      <label>Seu nome <input id="nome" type="text" maxlength="80" autocomplete="name" required></label>
      <p id="erro" class="erro" hidden></p>
      <button class="btn primario grande" type="submit">Criar minha fazenda</button>
    </form>
    <details class="avancado" style="margin-top:1.2rem"><summary>Sou funcionário de uma fazenda</summary>
      <p class="mudo">Peça ao dono para te adicionar na tela Equipe usando este e-mail: <b>${esc(user.email || '')}</b>. Depois é só entrar de novo.</p>
    </details>
    <p style="margin-top:1rem"><button class="btn" id="b-sair" type="button">Sair</button></p>
  </div></main>`;
  const f = root.querySelector('#f-faz'), erro = root.querySelector('#erro');
  root.querySelector('#b-sair').addEventListener('click', () => ctx.sair(true));
  f.addEventListener('submit', async (ev) => {
    ev.preventDefault(); erro.hidden = true;
    const fazenda = f.querySelector('#fazenda').value.trim(), nome = f.querySelector('#nome').value.trim();
    const falha = (m) => { erro.textContent = m; erro.hidden = false; };
    if (fazenda.length < 2) return falha('Informe o nome da fazenda.');
    if (nome.length < 2) return falha('Informe o seu nome.');
    if (!navigator.onLine) return falha('Sem internet. Conecte-se para continuar.');
    const btn = f.querySelector('button[type=submit]'); btn.disabled = true; btn.textContent = 'Criando…';
    try { await ctx.criarFazenda(fazenda, nome, user); }
    catch (e) { falha(e.message || 'Não foi possível criar a fazenda.'); btn.disabled = false; btn.textContent = 'Criar minha fazenda'; }
  });
}

export function renderRecuperar(ctx, root) {
  root.innerHTML = `
  <main class="login"><div class="login-card">
    ${cabeca('Esqueci minha senha', 'Informe seu e-mail. Enviaremos um link para criar uma senha nova.')}
    <form id="f-rec" class="form" novalidate>
      <label>E-mail <input id="email" type="email" autocomplete="username" inputmode="email" autocapitalize="none" required></label>
      <p id="erro" class="erro" hidden></p>
      <p id="ok" class="aviso" hidden></p>
      <button class="btn primario grande" type="submit">Enviar link</button>
    </form>
    <p style="margin-top:1.2rem"><button class="btn" id="b-voltar" type="button">Voltar ao login</button></p>
  </div></main>`;
  const f = root.querySelector('#f-rec'), erro = root.querySelector('#erro'), okp = root.querySelector('#ok');
  root.querySelector('#b-voltar').addEventListener('click', () => ctx.mostrarLogin());
  f.addEventListener('submit', async (ev) => {
    ev.preventDefault(); erro.hidden = true; okp.hidden = true;
    const email = f.querySelector('#email').value.trim();
    if (!/^\S+@\S+\.\S+$/.test(email)) { erro.textContent = 'Informe um e-mail válido.'; erro.hidden = false; return; }
    const btn = f.querySelector('button[type=submit]'); btn.disabled = true; btn.textContent = 'Enviando…';
    try {
      await ctx.pedirRecuperacao(email);
      okp.textContent = 'Se este e-mail tiver conta, enviamos um link. Abra o e-mail (olhe também o spam) e toque no link.';
      okp.hidden = false; btn.textContent = 'Enviar de novo'; btn.disabled = false;
    } catch (e) { erro.textContent = e.message || 'Não foi possível enviar.'; erro.hidden = false; btn.disabled = false; btn.textContent = 'Enviar link'; }
  });
}

// Tela aberta pelo link do e-mail de recuperação.
export function renderNovaSenha(ctx, root) {
  root.innerHTML = `
  <main class="login"><div class="login-card">
    ${cabeca('Crie uma senha nova')}
    <form id="f-nova" class="form" novalidate>
      <label>Senha nova <input id="senha" type="password" autocomplete="new-password" minlength="8" required><small class="mudo">Pelo menos 8 caracteres.</small></label>
      <label>Repita a senha <input id="senha2" type="password" autocomplete="new-password" minlength="8" required></label>
      <p id="erro" class="erro" hidden></p>
      <button class="btn primario grande" type="submit">Salvar e entrar</button>
    </form>
  </div></main>`;
  const f = root.querySelector('#f-nova'), erro = root.querySelector('#erro');
  f.addEventListener('submit', async (ev) => {
    ev.preventDefault(); erro.hidden = true;
    const a = f.querySelector('#senha').value, b = f.querySelector('#senha2').value;
    const falha = (m) => { erro.textContent = m; erro.hidden = false; };
    if (a.length < 8) return falha('A senha precisa ter pelo menos 8 caracteres.');
    if (a !== b) return falha('As duas senhas são diferentes.');
    const btn = f.querySelector('button[type=submit]'); btn.disabled = true; btn.textContent = 'Salvando…';
    try { await ctx.definirNovaSenha(a); }
    catch (e) { falha(e.message || 'Não foi possível salvar a senha.'); btn.disabled = false; btn.textContent = 'Salvar e entrar'; }
  });
}
