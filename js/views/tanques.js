// Cadastro de tanques e lotes (dono e gerente). Precisa de internet.
import { confirmar } from '../dialogo.js';
import { icone } from '../icons.js';
import { esc, fmtData, fmtInt, fmtNum, hojeISO, num, ROTULO_TIPO } from '../util.js';

const ESPECIES = ['Tilápia', 'Tambaqui', 'Tambacu', 'Pintado', 'Pirarucu', 'Matrinxã', 'Curimatã', 'Pacu', 'Carpa'];

const semPermissao = (el) => { el.innerHTML = '<div class="card vazio">Você não tem permissão para esta tela.</div>'; };
const avisoOffline = () => (navigator.onLine ? '' : '<p class="aviso">Sem internet: cadastros de tanques e lotes só funcionam com conexão.</p>');

export async function renderTanques(ctx, el) {
  if (!ctx.podeGerir()) return semPermissao(el);
  const { tanques, lotes } = ctx.state.ref;

  el.innerHTML = `
    <h1>Tanques</h1>
    ${avisoOffline()}
    <div class="card">
      ${tanques.length ? `<ul class="lista">${tanques.map((t) => {
        const n = lotes.filter((l) => l.tanque_id === t.id).length;
        return `<li><a class="esq" href="#/tanque/${esc(t.id)}"><b>${esc(t.nome)}</b><small>${n ? n + ' lote(s) ativo(s)' : 'sem lote ativo'}</small></a><span class="seta">${icone('direita', 20)}</span></li>`;
      }).join('')}</ul>` : '<p class="mudo" style="margin:0">Nenhum tanque cadastrado ainda.</p>'}
    </div>
    <form id="f-novo" class="card form" novalidate>
      <h3>Novo tanque</h3>
      <label>Nome do tanque <input id="nome" maxlength="60" placeholder="Ex.: Tanque 1" required></label>
      <p id="erro" class="erro" hidden></p>
      <button class="btn primario" type="submit">Cadastrar tanque</button>
    </form>`;

  const f = el.querySelector('#f-novo');
  const erro = f.querySelector('#erro');
  f.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    erro.hidden = true;
    const nome = f.querySelector('#nome').value.trim();
    if (!nome) { erro.textContent = 'Informe o nome do tanque.'; erro.hidden = false; return; }
    if (tanques.some((t) => t.nome.toLowerCase() === nome.toLowerCase())) { erro.textContent = 'Já existe um tanque com esse nome.'; erro.hidden = false; return; }
    const btn = f.querySelector('button'); btn.disabled = true;
    try {
      await ctx.api.criarTanque(ctx.state.perfil.fazenda_id, nome);
      await ctx.atualizarRef();
      ctx.toast('Tanque cadastrado', 'ok');
      renderTanques(ctx, el);
    } catch (e) {
      erro.textContent = e.message; erro.hidden = false; btn.disabled = false;
    }
  });
}

export async function renderTanque(ctx, el, id) {
  if (!ctx.podeGerir()) return semPermissao(el);
  const tanque = ctx.state.ref.tanques.find((t) => t.id === id);
  if (!tanque) { el.innerHTML = '<div class="card vazio">Tanque não encontrado.<br><a class="btn" href="#/tanques">Voltar</a></div>'; return; }

  el.innerHTML = `<h1>${esc(tanque.nome)}</h1><p class="carregando">Carregando…</p>`;
  const todos = (await ctx.api.lotes()).filter((l) => l.tanque_id === id);
  const ativos = todos.filter((l) => l.ativo);
  const dono = ctx.state.perfil.papel === 'dono';
  const hoje = hojeISO();

  el.innerHTML = `
    <p class="no-print"><a class="voltar" href="#/tanques">${icone('voltar', 18)} Todos os tanques</a></p>
    <h1>${esc(tanque.nome)}</h1>
    ${avisoOffline()}

    <h2>Lotes</h2>
    <div class="card">
      ${todos.length ? `<ul class="lista">${todos.map((l) => `
        <li>
          <div class="esq"><b>${esc(ROTULO_TIPO[l.tipo] || l.tipo)} · ${esc(l.especie)}</b>
            <small>desde ${fmtData(l.data_entrada)} · ${fmtInt(l.quantidade_inicial)} peixes · ${fmtNum(l.peso_inicial_kg, 1)} kg</small></div>
          <div class="acoes" style="margin:0">
            <span class="tag ${l.ativo ? 'ok' : ''}">${l.ativo ? 'Ativo' : 'Encerrado'}</span>
            <a class="btn mini" href="#/relatorio/${esc(l.id)}">Relatório</a>
            ${l.ativo ? `<button class="btn mini perigo" data-encerrar="${esc(l.id)}" type="button">Encerrar</button>` : ''}
            ${dono ? `<button class="btn mini perigo" data-excluir-lote="${esc(l.id)}" type="button">Excluir</button>` : ''}
          </div>
        </li>`).join('')}</ul>` : '<p class="mudo" style="margin:0">Nenhum lote neste tanque ainda.</p>'}
    </div>

    <form id="f-lote" class="card form" novalidate>
      <h3>Novo lote de peixes</h3>
      <div class="duas">
        <label>Fase
          <select id="tipo"><option value="engorda">Engorda</option><option value="alevinagem">Alevinagem</option></select></label>
        <label>Espécie
          <input id="especie" list="especies" maxlength="60" placeholder="Ex.: Tilápia" required>
          <datalist id="especies">${ESPECIES.map((e) => `<option value="${esc(e)}">`).join('')}</datalist></label>
      </div>
      <label>Data de entrada no tanque <input id="data" type="date" value="${hoje}" max="${hoje}" required></label>
      <div class="duas">
        <label>Quantidade de peixes <input id="qtd" type="number" inputmode="numeric" step="1" min="1" required></label>
        <label>Peso total do lote (kg) <input id="peso" type="number" inputmode="decimal" step="0.01" min="0" required></label>
      </div>
      <div class="calc" id="pm">Peso médio inicial: —</div>
      <p id="erro" class="erro" hidden></p>
      <button class="btn primario" type="submit">Cadastrar lote</button>
    </form>

    <h2>Nome do tanque</h2>
    <form id="f-nome" class="card form" novalidate>
      <label>Renomear <input id="nome" maxlength="60" value="${esc(tanque.nome)}"></label>
      <p id="erro-nome" class="erro" hidden></p>
      <button class="btn" type="submit">Salvar nome</button>
    </form>
    ${dono ? `<h2>Apagar tanque</h2>
    <div class="card">
      <p style="margin-top:0">Use para zerar um tanque cadastrado errado ou recomeçar do zero. Apaga o tanque, os lotes e <b>todos</b> os lançamentos dele.</p>
      <button class="btn perigo" id="b-apagar-tanque" type="button">Apagar este tanque</button>
    </div>` : ''}`;

  // peso médio inicial ao vivo
  const f = el.querySelector('#f-lote');
  const atualizaPm = () => {
    const q = num(f.querySelector('#qtd').value), p = num(f.querySelector('#peso').value);
    f.querySelector('#pm').textContent = q > 0 && p > 0 ? `Peso médio inicial: ${fmtNum((p / q) * 1000, 1)} g por peixe` : 'Peso médio inicial: —';
  };
  f.querySelector('#qtd').addEventListener('input', atualizaPm);
  f.querySelector('#peso').addEventListener('input', atualizaPm);

  const erro = f.querySelector('#erro');
  f.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    erro.hidden = true;
    const especie = f.querySelector('#especie').value.trim();
    const qtd = num(f.querySelector('#qtd').value), peso = num(f.querySelector('#peso').value);
    const falha = (m) => { erro.textContent = m; erro.hidden = false; };
    if (!especie) return falha('Informe a espécie.');
    if (!f.querySelector('#data').value) return falha('Informe a data de entrada.');
    if (!(qtd >= 1) || !Number.isInteger(qtd)) return falha('Informe a quantidade de peixes (número inteiro).');
    if (!(peso > 0)) return falha('Informe o peso total do lote em kg.');
    if (ativos.length && !(await confirmar({ titulo: ativos.length === 1 ? 'Este tanque já tem um lote ativo' : `Este tanque já tem ${ativos.length} lotes ativos`, texto: 'Se o lote anterior terminou, encerre-o antes de cadastrar o novo. Quer cadastrar outro lote mesmo assim?', ok: 'Cadastrar mesmo assim', cancelar: 'Voltar' }))) return;
    const btn = f.querySelector('button[type=submit]'); btn.disabled = true;
    try {
      await ctx.api.criarLote({ tanque_id: id, tipo: f.querySelector('#tipo').value, especie, data_entrada: f.querySelector('#data').value, quantidade_inicial: qtd, peso_inicial_kg: peso });
      await ctx.atualizarRef();
      ctx.toast('Lote cadastrado', 'ok');
      renderTanque(ctx, el, id);
    } catch (e) { falha(e.message); btn.disabled = false; }
  });

  el.querySelectorAll('[data-encerrar]').forEach((b) =>
    b.addEventListener('click', async () => {
      if (!(await confirmar({ titulo: 'Encerrar este lote?', texto: 'Ele deixa de aparecer nos lançamentos. O histórico e o relatório continuam disponíveis.', ok: 'Encerrar lote' }))) return;
      try {
        await ctx.api.encerrarLote(b.dataset.encerrar);
        await ctx.atualizarRef();
        ctx.toast('Lote encerrado', 'ok');
        renderTanque(ctx, el, id);
      } catch (e) { ctx.toast(e.message, 'erro'); }
    }));

  // resumo do que será apagado (para o dono saber o que perde)
  async function resumoDe(lotesIds) {
    const r = { bios: 0, mort: 0, racN: 0, racKg: 0 };
    for (const lid of lotesIds) {
      const d = await ctx.api.dadosLote(lid);
      r.bios += d.bios.length; r.mort += d.mort.length; r.racN += d.rac.length; r.racKg += d.rac.reduce((s, x) => s + Number(x.quantidade_kg || 0), 0);
    }
    return r;
  }
  const txtResumo = (r) => `${r.bios} biometria(s), ${r.mort} registro(s) de mortalidade e ${r.racN} lançamento(s) de ração (${fmtNum(r.racKg, 0)} kg). A ração apagada volta para o saldo do estoque.`;

  el.querySelectorAll('[data-excluir-lote]').forEach((b) => b.addEventListener('click', async () => {
    if (!navigator.onLine) return ctx.toast('Sem internet', 'erro');
    try {
      const lote = todos.find((l) => l.id === b.dataset.excluirLote);
      const r = await resumoDe([lote.id]);
      if (!(await confirmar({ titulo: 'Excluir este lote?', texto: `Será apagado de vez, com ${txtResumo(r)} Não dá para desfazer.`, ok: 'Excluir lote', perigo: true }))) return;
      await ctx.api.excluirLote(lote.id);
      await ctx.atualizarRef(true);
      ctx.toast('Lote excluído', 'ok');
      renderTanque(ctx, el, id);
    } catch (e) { ctx.toast(e.message, 'erro'); }
  }));

  const ba = el.querySelector('#b-apagar-tanque');
  if (ba) ba.addEventListener('click', async () => {
    if (!navigator.onLine) return ctx.toast('Sem internet', 'erro');
    try {
      const r = await resumoDe(todos.map((l) => l.id));
      if (!(await confirmar({ titulo: `Apagar "${tanque.nome}"?`, texto: `Serão apagados ${todos.length} lote(s), ${txtResumo(r)}`, ok: 'Continuar', perigo: true }))) return;
      if (!(await confirmar({ titulo: 'Tem certeza?', texto: `"${tanque.nome}" e todo o histórico dele serão apagados de vez. Não dá para desfazer.`, ok: 'Apagar tanque', perigo: true }))) return;
      await ctx.api.excluirTanque(id);
      await ctx.atualizarRef(true);
      ctx.toast('Tanque apagado', 'ok');
      location.hash = '#/tanques';
    } catch (e) { ctx.toast(e.message, 'erro'); }
  });

  const fn = el.querySelector('#f-nome');
  fn.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const e = fn.querySelector('#erro-nome'); e.hidden = true;
    const nome = fn.querySelector('#nome').value.trim();
    if (!nome) { e.textContent = 'Informe o nome.'; e.hidden = false; return; }
    try {
      await ctx.api.renomearTanque(id, nome);
      await ctx.atualizarRef();
      ctx.toast('Nome salvo', 'ok');
      renderTanque(ctx, el, id);
    } catch (err) { e.textContent = err.message; e.hidden = false; }
  });
}
