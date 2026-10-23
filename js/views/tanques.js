// Cadastro de tanques e lotes (dono e gerente). Precisa de internet.
import { confirmar, ocupado, formulario } from '../dialogo.js';
import { icone } from '../icons.js';
import { ESPECIES } from '../config.js';
import { esc, fmtData, fmtInt, fmtNum, hojeISO, num, ROTULO_TIPO, FASES, areaHa, progresso, fmtPct } from '../util.js';
import { lerPlanilha } from '../planilha.js';


// 2,3 kg / 500 g; 5,5 ha
const pmTxt = (kg) => (kg >= 1 ? `${fmtNum(kg, kg % 1 ? 2 : 0)} kg` : `${fmtNum(kg * 1000, 0)} g`);
const haTxt = (ha) => `${fmtNum(ha, Number(ha) % 1 ? 2 : 0).replace(/(,\d)0$/, '$1')} ha`;
const semPermissao = (el) => { el.innerHTML = '<div class="card vazio">Você não tem permissão para esta tela.</div>'; };
const avisoOffline = () => (navigator.onLine ? '' : '<p class="aviso">Sem internet: cadastros de tanques e lotes só funcionam com conexão.</p>');

export async function renderTanques(ctx, el) {
  if (!ctx.podeGerir()) return semPermissao(el);
  const { tanques, lotes } = ctx.state.ref;

  el.innerHTML = `
    <h1>Tanques</h1>
    ${avisoOffline()}
    <div class="card">
      ${tanques.length ? `<ul class="lista lista-grade">${tanques.map((t) => {
        const ls = lotes.filter((l) => l.tanque_id === t.id);
        const peixes = ls.reduce((a, l) => a + (Number(l.quantidade_inicial) || 0), 0);
        const sub = ls.length > 1 ? `${ls.length} lotes ativos · ${fmtInt(peixes)} peixes` : ls.length ? `${ROTULO_TIPO[ls[0].tipo] || ls[0].tipo} · ${fmtInt(peixes)} peixes` : 'sem lote ativo';
        return `<li><a class="esq" href="#/tanque/${esc(t.id)}"><b>${esc(t.nome)}</b><small>${esc(sub)}${t.area_ha ? ` · ${haTxt(t.area_ha)}` : ''}</small></a><span class="seta">${icone('direita', 20)}</span></li>`;
      }).join('')}</ul>` : '<p class="mudo" style="margin:0">Nenhum tanque cadastrado ainda.</p>'}
    </div>
    <div class="pc-duas">
    <form id="f-novo" class="card form" novalidate>
      <h3>Novo tanque</h3>
      <div class="duas">
        <label>Nome do tanque <input id="nome" maxlength="60" placeholder="Ex.: Tanque 1" required></label>
        <label>Área (hectares) <small class="mudo">opcional</small><input id="area" type="text" inputmode="decimal" placeholder="Ex.: 5,5"></label>
      </div>
      <p id="erro" class="erro" hidden></p>
      <button class="btn primario" type="submit">Cadastrar tanque</button>
    </form>
    <details class="form-dobra" id="d-planilha">
      <summary>Cadastrar vários tanques de uma vez (colar planilha)</summary>
      <div class="form">
        <p class="mudo" style="margin-top:0">Copie as linhas do Excel (ou escreva uma por linha) nesta ordem: <b>Tanque · Área (ha) · Fase · Peixes · Peso médio · Início do ciclo</b>. Pode separar por tabulação ou ponto e vírgula. Peso em kg ou com "g" (ex.: 500 g). Tanque sem peixes entra só como tanque.</p>
        <textarea id="planilha" rows="7" aria-label="Linhas da planilha ou mensagem do WhatsApp com os tanques" placeholder="Tanque 1;5,5;Engorda;12000;2,3;10/06/2026&#10;Tanque 6;8,5;Recria;98000;500 g;15/08/2026&#10;Tanque 8;2,3"></textarea>
        <div id="previa"></div>
        <p id="erro-pl" class="erro" hidden></p>
        <button class="btn primario" id="b-importar" type="button" hidden>Cadastrar</button>
      </div>
    </details>
    </div>`;

  const f = el.querySelector('#f-novo');
  const erro = f.querySelector('#erro');
  f.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    erro.hidden = true;
    const nome = f.querySelector('#nome').value.trim();
    const areaTxt = f.querySelector('#area').value.trim(), area = areaHa(areaTxt);
    if (!nome) { erro.textContent = 'Informe o nome do tanque.'; erro.hidden = false; return; }
    if (areaTxt && !area) { erro.textContent = 'Área inválida. Use hectares, ex.: 5,5'; erro.hidden = false; return; }
    if (tanques.some((t) => t.nome.toLowerCase() === nome.toLowerCase())) { erro.textContent = 'Já existe um tanque com esse nome.'; erro.hidden = false; return; }
    const btn = f.querySelector('button'); btn.disabled = true;
    try {
      await ctx.api.criarTanque(ctx.state.perfil.fazenda_id, nome, area);
      await ctx.atualizarRef();
      ctx.toast('Tanque cadastrado', 'ok');
      renderTanques(ctx, el);
    } catch (e) {
      erro.textContent = e.message; erro.hidden = false; btn.disabled = false;
    }
  });

  // ---- vários tanques de uma vez (colar planilha) ----
  const ta = el.querySelector('#planilha'), previa = el.querySelector('#previa'), bImp = el.querySelector('#b-importar'), erroPl = el.querySelector('#erro-pl');
  let linhas = [];
  const mostrar = () => {
    erroPl.hidden = true;
    linhas = lerPlanilha(ta.value, tanques, lotes);
    const validas = linhas.filter((l) => !l.erro);
    previa.innerHTML = linhas.length ? `<div class="rolagem"><table class="previa-pl">
      <thead><tr><th>Tanque</th><th class="n">Área</th><th>Fase</th><th class="n">Peixes</th><th class="n">Peso médio</th><th>Início</th><th class="n">Peso total</th></tr></thead>
      <tbody>${linhas.map((l) => l.erro ? `<tr class="pl-erro"><td colspan="7"><b>Linha ${l.n}:</b> ${esc(l.erro)}</td></tr>`
        : `<tr><td>${esc(l.nome)}${l.existe ? ' <small class="mudo">(já existe)</small>' : ''}</td><td class="n">${l.area ? haTxt(l.area).replace(' ha', '') : '—'}</td><td>${l.tipo ? esc(ROTULO_TIPO[l.tipo]) : '—'}</td>
           <td class="n">${l.qtd ? fmtInt(l.qtd) : '—'}</td><td class="n">${l.pm ? (l.pm < 1 ? fmtNum(l.pm * 1000, 0) + ' g' : fmtNum(l.pm, 2) + ' kg') : '—'}</td>
           <td>${l.data ? fmtData(l.data) : '—'}</td><td class="n">${l.qtd ? fmtNum(l.qtd * l.pm, 0) + ' kg' : '—'}</td></tr>`).join('')}</tbody></table></div>
      <p class="mudo">${validas.length} linha(s) prontas${linhas.length - validas.length ? `, ${linhas.length - validas.length} com problema (corrija ou apague)` : ''}.</p>` : '';
    bImp.hidden = !validas.length;
    bImp.textContent = `Cadastrar ${validas.length} linha(s)`;
  };
  ta.addEventListener('input', mostrar);
  bImp.addEventListener('click', async () => {
    if (!navigator.onLine) return ctx.toast('Sem internet', 'erro');
    const validas = linhas.filter((l) => !l.erro);
    if (linhas.length !== validas.length && !(await confirmar({ titulo: 'Há linhas com problema', texto: 'Só as linhas certas serão cadastradas. Continuar?', ok: 'Continuar' }))) return;
    const livre = ocupado('Cadastrando…');
    let feitos = 0;
    try {
      for (const l of validas) {
        const tq = l.existe || { id: await ctx.api.criarTanque(ctx.state.perfil.fazenda_id, l.nome, l.area).catch((e) => (/sql\/17/.test(e.message) ? ctx.api.criarTanque(ctx.state.perfil.fazenda_id, l.area ? `${l.nome} · ${haTxt(l.area)}` : l.nome) : Promise.reject(e))) };
        if (l.existe && l.area && !l.existe.area_ha) await ctx.api.renomearTanque(tq.id, l.existe.nome, l.area);
        if (l.qtd) {
          const loteId = await ctx.api.criarLote({ tanque_id: tq.id, tipo: l.tipo, especie: l.especie, data_entrada: l.data, quantidade_inicial: l.qtd, peso_inicial_kg: Math.round(l.qtd * l.pm * 100) / 100 });
          if (l.pmHoje) await ctx.api.biometriaInicial(loteId, l.pmHoje, ctx.state.perfil.id, hojeISO());
        }
        feitos++;
      }
      await ctx.atualizarRef(true);
      ctx.toast(`${feitos} linha(s) cadastrada(s)`, 'ok');
      renderTanques(ctx, el);
    } catch (e) {
      erroPl.textContent = `Parou na linha ${validas[feitos]?.n}: ${e.message}${feitos ? ` (as ${feitos} anteriores foram cadastradas)` : ''}`; erroPl.hidden = false;
      await ctx.atualizarRef(true).catch(() => {});
    } finally { livre(); }
  });
}

export async function renderTanque(ctx, el, id) {
  if (!ctx.podeGerir()) return semPermissao(el);
  const tanque = ctx.state.ref.tanques.find((t) => t.id === id);
  if (!tanque) { el.innerHTML = '<div class="card vazio">Tanque não encontrado.<br><a class="btn" href="#/tanques">Voltar</a></div>'; return; }

  el.innerHTML = `<h1>${esc(tanque.nome)}</h1><p class="carregando">Carregando…</p>`;
  const [lotesTodos, resumoRows] = await Promise.all([ctx.api.lotes(), ctx.api.resumoLotes().catch(() => [])]);
  const todos = lotesTodos.filter((l) => l.tanque_id === id);
  const ativos = todos.filter((l) => l.ativo);
  // peixe na água agora (mesma estimativa da tela Início: vivos × último peso médio)
  const resumo = Object.fromEntries((resumoRows || []).map((r) => [r.lote_id, r]));
  let vivos = 0, biomassa = 0, iniciais = 0;
  for (const l of ativos) {
    iniciais += Number(l.quantidade_inicial) || 0;
    const r = resumo[l.id];
    const v = Math.max(0, Number(l.quantidade_inicial) - Number((r && r.mortos) || 0));
    const pm = r && r.ultimo_peso_medio_kg != null ? Number(r.ultimo_peso_medio_kg) : Number(l.peso_inicial_kg) / Math.max(1, Number(l.quantidade_inicial));
    vivos += v; biomassa += v * (pm || 0);
  }
  const area = Number(tanque.area_ha) || 0;
  const temArea = 'area_ha' in tanque; // banco com o sql/17
  const dono = ctx.state.perfil.papel === 'dono';
  const hoje = hojeISO();

  el.innerHTML = `
    <p class="no-print"><a class="voltar" href="#/tanques">${icone('voltar', 18)} Todos os tanques</a></p>
    <h1>${esc(tanque.nome)}</h1>
    ${avisoOffline()}
    ${ativos.length || area ? `<div class="kpis tq-resumo">
      <div class="kpi"><span>Peixes vivos</span><b>${fmtInt(vivos)}</b>${iniciais > 0 ? `${progresso((vivos / iniciais) * 100, { tom: 'ok', fina: true, rotulo: `Sobrevivência ${fmtPct((vivos / iniciais) * 100)}%` })}<small>${fmtPct((vivos / iniciais) * 100)}% dos ${fmtInt(iniciais)} que entraram</small>` : ''}</div>
      <div class="kpi"><span>Peixe na água</span><b>${biomassa >= 1000 ? fmtNum(biomassa / 1000, 1) + ' t' : fmtNum(biomassa, 0) + ' kg'}</b></div>
      ${area ? `<div class="kpi"><span>Área</span><b>${haTxt(area)}</b></div>
      <div class="kpi"><span>Densidade</span><b>${fmtInt(vivos / area)} peixes/ha</b><small>${fmtNum(biomassa / 1000 / area, 1)} t/ha</small></div>` : ''}
    </div>` : ''}

    <div class="pc-duas"><div>
    <h2>Lotes</h2>
    <div class="card">
      ${todos.length ? `<ul class="lista">${todos.map((l) => `
        <li>
          <div class="esq"><b>${esc(ROTULO_TIPO[l.tipo] || l.tipo)} · ${esc(l.especie)}</b>
            <small>desde ${fmtData(l.data_entrada)} · ${fmtInt(l.quantidade_inicial)} peixes · ${pmTxt(Number(l.peso_inicial_kg) / Math.max(1, Number(l.quantidade_inicial)))} cada na entrada (${fmtNum(l.peso_inicial_kg, 0)} kg)</small></div>
          <div class="acoes" style="margin:0">
            <span class="tag ${l.ativo ? 'ok' : ''}">${l.ativo ? 'Ativo' : 'Encerrado'}</span>
            <a class="btn mini" href="#/relatorio/${esc(l.id)}">Relatório</a>
            <button class="btn mini" data-editar-lote="${esc(l.id)}" type="button">Editar</button>
            ${l.ativo ? `<button class="btn mini perigo" data-encerrar="${esc(l.id)}" type="button">Encerrar</button>` : `<button class="btn mini" data-reabrir="${esc(l.id)}" type="button">Reabrir</button>`}
          </div>
        </li>`).join('')}</ul>` : '<p class="mudo" style="margin:0">Nenhum lote neste tanque ainda.</p>'}
    </div>

    </div><div>
    <form id="f-lote" class="card form" novalidate>
      <h3>Novo lote de peixes</h3>
      <div class="duas">
        <label>Fase
          <select id="tipo">${FASES.map(([v, r]) => `<option value="${v}"${v === 'engorda' ? ' selected' : ''}>${r}</option>`).join('')}</select></label>
        <label>Espécie
          <select id="especie">${ESPECIES.map((e) => `<option value="${esc(e)}">${esc(e)}</option>`).join('')}<option value="__outra">Outra…</option></select></label>
      </div>
      <label id="especie-outra-wrap" hidden>Qual espécie? <input id="especie-outra" maxlength="60" placeholder="Digite o nome do peixe"></label>
      <label class="linha-check"><input type="checkbox" id="andamento"> Os peixes já estão no tanque (lote em andamento)</label>
      <label><span id="rot-data">Data de entrada no tanque</span> <input id="data" type="date" value="${hoje}" max="${hoje}" required></label>
      <label>Quantidade de peixes <input id="qtd" type="number" inputmode="numeric" step="1" min="1" required></label>
      <div class="duas">
        <label><span id="rot-pm">Peso médio de cada peixe</span> <input id="pm-in" type="text" inputmode="decimal" placeholder="Ex.: 2,3" required></label>
        <label>Unidade <select id="pm-un"><option value="kg">kg</option><option value="g">gramas</option></select></label>
      </div>
      <div class="duas" id="hoje-wrap" hidden>
        <label>Peso médio de hoje <input id="pmh-in" type="text" inputmode="decimal" placeholder="Ex.: 2,3"></label>
        <label>Unidade <select id="pmh-un"><option value="kg">kg</option><option value="g">gramas</option></select></label>
      </div>
      <p class="mudo pequeno" id="ajuda-andamento" hidden>O peso de hoje vira a primeira pesagem (biometria) do lote, para a curva de crescimento começar certa. Se não souber o peso na entrada, use uma estimativa.</p>
      <div class="calc" id="pm">Peso total do lote: —</div>
      <p id="erro" class="erro" hidden></p>
      <button class="btn primario" type="submit">Cadastrar lote</button>
    </form>

    <h2>Nome${temArea ? ' e área' : ''} do tanque</h2>
    <form id="f-nome" class="card form" novalidate>
      <div class="duas">
        <label>Nome <input id="nome" maxlength="60" value="${esc(tanque.nome)}"></label>
        ${temArea ? `<label>Área (hectares) <input id="area" type="text" inputmode="decimal" value="${tanque.area_ha != null ? esc(String(tanque.area_ha).replace('.', ',')) : ''}" placeholder="Ex.: 5,5"></label>` : ''}
      </div>
      <p id="erro-nome" class="erro" hidden></p>
      <button class="btn" type="submit">Salvar</button>
    </form>
    </div></div>
    ${dono ? `<details class="avancado">
      <summary>Opções avançadas</summary>
      <div class="card">
        <p style="margin-top:0"><b>Excluir um lote</b><br><span class="mudo">Apaga o lote e tudo o que foi lançado nele. Use se o lote foi cadastrado errado.</span></p>
        ${todos.length ? `<ul class="lista">${todos.map((l) => `<li><div class="esq"><b>${esc(ROTULO_TIPO[l.tipo] || l.tipo)} · ${esc(l.especie)}</b><small>desde ${fmtData(l.data_entrada)} · ${l.ativo ? 'ativo' : 'encerrado'}</small></div>
          <button class="btn mini perigo" data-excluir-lote="${esc(l.id)}" type="button">Excluir</button></li>`).join('')}</ul>` : '<p class="mudo">Nenhum lote.</p>'}
        <hr>
        <p><b>Apagar o tanque inteiro</b><br><span class="mudo">Apaga o tanque, os lotes e todos os lançamentos dele. Serve para zerar e recomeçar.</span></p>
        <button class="btn perigo" id="b-apagar-tanque" type="button">Apagar este tanque</button>
      </div>
    </details>` : ''}`;

  // peso médio por peixe → peso total do lote (o banco guarda o total)
  const f = el.querySelector('#f-lote');
  const pmKg = (inp, un) => { const v = num(f.querySelector(inp).value); return v > 0 ? (f.querySelector(un).value === 'g' ? v / 1000 : v) : null; };
  const atualizaPm = () => {
    const q = num(f.querySelector('#qtd').value), pm = pmKg('#pm-in', '#pm-un');
    f.querySelector('#pm').textContent = q > 0 && pm ? `Peso total do lote: ${fmtNum(q * pm, q * pm < 100 ? 1 : 0)} kg (${fmtInt(q)} × ${pmTxt(pm)})` : 'Peso total do lote: —';
  };
  f.addEventListener('input', atualizaPm); f.addEventListener('change', atualizaPm);
  const andamento = f.querySelector('#andamento');
  andamento.addEventListener('change', () => {
    const on = andamento.checked;
    f.querySelector('#hoje-wrap').hidden = !on; f.querySelector('#ajuda-andamento').hidden = !on;
    f.querySelector('#rot-data').textContent = on ? 'Início do ciclo' : 'Data de entrada no tanque';
    f.querySelector('#rot-pm').textContent = on ? 'Peso médio na entrada' : 'Peso médio de cada peixe';
  });

  f.querySelector('#especie').addEventListener('change', (e) => { const o = e.target.value === '__outra'; f.querySelector('#especie-outra-wrap').hidden = !o; if (o) f.querySelector('#especie-outra').focus(); });

  const erro = f.querySelector('#erro');
  f.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    erro.hidden = true;
    const especie = f.querySelector('#especie').value === '__outra' ? f.querySelector('#especie-outra').value.trim() : f.querySelector('#especie').value;
    const qtd = num(f.querySelector('#qtd').value), pm = pmKg('#pm-in', '#pm-un'), pmHoje = andamento.checked ? pmKg('#pmh-in', '#pmh-un') : null;
    const peso = qtd > 0 && pm ? Math.round(qtd * pm * 100) / 100 : 0;
    const falha = (m) => { erro.textContent = m; erro.hidden = false; };
    if (!especie) return falha('Informe a espécie.');
    if (!f.querySelector('#data').value) return falha('Informe a data de entrada.');
    if (!(qtd >= 1) || !Number.isInteger(qtd)) return falha('Informe a quantidade de peixes (número inteiro).');
    if (!pm) return falha('Informe o peso médio de cada peixe.');
    if (pm > 30) return falha('Peso médio acima de 30 kg por peixe. Confira se não digitou o peso total ou se a unidade é gramas.');
    if (andamento.checked && !pmHoje) return falha('Informe o peso médio de hoje (ou desmarque "lote em andamento").');
    if (!(peso > 0)) return falha('Peso total do lote inválido.');
    if (ativos.length && !(await confirmar({ titulo: ativos.length === 1 ? 'Este tanque já tem um lote ativo' : `Este tanque já tem ${ativos.length} lotes ativos`, texto: 'Se o lote anterior terminou, encerre-o antes de cadastrar o novo. Quer cadastrar outro lote mesmo assim?', ok: 'Cadastrar mesmo assim', cancelar: 'Voltar' }))) return;
    const btn = f.querySelector('button[type=submit]'); btn.disabled = true;
    try {
      const loteId = await ctx.api.criarLote({ tanque_id: id, tipo: f.querySelector('#tipo').value, especie, data_entrada: f.querySelector('#data').value, quantidade_inicial: qtd, peso_inicial_kg: peso });
      if (pmHoje) await ctx.api.biometriaInicial(loteId, pmHoje, ctx.state.perfil.id, hoje);
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

  el.querySelectorAll('[data-editar-lote]').forEach((b) =>
    b.addEventListener('click', async () => {
      if (!navigator.onLine) return ctx.toast('Sem internet', 'erro');
      const l = todos.find((x) => x.id === b.dataset.editarLote); if (!l) return;
      const v = await formulario({
        titulo: 'Corrigir dados do lote', texto: 'Os relatórios do lote serão recalculados com os dados novos.',
        campos: [
          { nome: 'tipo', rotulo: 'Fase', tipo: 'select', valor: l.tipo, opcoes: FASES },
          { nome: 'especie', rotulo: 'Espécie', tipo: 'text', valor: l.especie, maxlength: '60' },
          { nome: 'data', rotulo: 'Data de entrada no tanque', tipo: 'date', valor: l.data_entrada, max: hoje },
          { nome: 'qtd', rotulo: 'Quantidade de peixes', tipo: 'number', valor: l.quantidade_inicial, step: '1', min: '1', inputmode: 'numeric' },
          { nome: 'pm', rotulo: 'Peso médio de cada peixe na entrada (kg)', tipo: 'text', valor: String(Math.round(Number(l.peso_inicial_kg) / Math.max(1, Number(l.quantidade_inicial)) * 1000) / 1000).replace('.', ','), inputmode: 'decimal', ajuda: 'Em kg: 500 gramas = 0,5. O app calcula o peso total do lote.' },
        ],
        validar: (x) => (!x.especie.trim() ? 'Informe a espécie.' : !x.data ? 'Informe a data de entrada.' : x.data > hoje ? 'A data não pode ser no futuro.'
          : !(Number.isInteger(num(x.qtd)) && num(x.qtd) >= 1) ? 'Informe a quantidade de peixes (número inteiro).' : !(num(x.pm) > 0) ? 'Informe o peso médio de cada peixe em kg.' : num(x.pm) > 30 ? 'Peso médio acima de 30 kg: confira (é por peixe, em kg).' : null),
      });
      if (!v) return;
      try {
        await ctx.api.atualizar('lotes', l.id, { tipo: v.tipo, especie: v.especie.trim(), data_entrada: v.data, quantidade_inicial: num(v.qtd), peso_inicial_kg: Math.round(num(v.qtd) * num(v.pm) * 100) / 100 });
        await ctx.atualizarRef();
        ctx.toast('Lote corrigido', 'ok');
        renderTanque(ctx, el, id);
      } catch (e) { ctx.toast(e.message, 'erro'); }
    }));

  el.querySelectorAll('[data-reabrir]').forEach((b) =>
    b.addEventListener('click', async () => {
      if (!navigator.onLine) return ctx.toast('Sem internet', 'erro');
      const texto = ativos.length ? `Este tanque já tem ${ativos.length === 1 ? 'um lote ativo' : `${ativos.length} lotes ativos`}. Os dois vão aparecer nos lançamentos.` : 'Ele volta a aparecer nos lançamentos.';
      if (!(await confirmar({ titulo: 'Reabrir este lote?', texto, ok: 'Reabrir lote' }))) return;
      try {
        await ctx.api.reabrirLote(b.dataset.reabrir);
        await ctx.atualizarRef();
        ctx.toast('Lote reaberto', 'ok');
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
      const livre0 = ocupado('Conferindo o que será apagado…');
      let r, lixo; try { [r, lixo] = await Promise.all([resumoDe([lote.id]), ctx.api.temLixeira()]); } finally { livre0(); }
      if (!(await confirmar({ titulo: 'Excluir este lote?', texto: `Será apagado com ${txtResumo(r)} ${lixo ? 'Fica na lixeira por 180 dias: dá para restaurar em Mais > Histórico e lixeira.' : 'Não dá para desfazer.'}`, ok: 'Excluir lote', perigo: true, digitar: 'excluir' }))) return;
      const livre = ocupado('Excluindo o lote…');
      try { await ctx.api.excluirLote(lote.id); await ctx.atualizarRef(true); } finally { livre(); }
      ctx.toast('Lote excluído', 'ok');
      renderTanque(ctx, el, id);
    } catch (e) { ctx.toast(e.message, 'erro'); }
  }));

  const ba = el.querySelector('#b-apagar-tanque');
  if (ba) ba.addEventListener('click', async () => {
    if (!navigator.onLine) return ctx.toast('Sem internet', 'erro');
    try {
      const livre0 = ocupado('Conferindo o que será apagado…');
      let r, lixo; try { [r, lixo] = await Promise.all([resumoDe(todos.map((l) => l.id)), ctx.api.temLixeira()]); } finally { livre0(); }
      if (!(await confirmar({ titulo: `Apagar "${tanque.nome}"?`, texto: `Serão apagados ${todos.length} lote(s), ${txtResumo(r)} ${lixo ? 'Fica na lixeira por 180 dias: dá para restaurar em Mais > Histórico e lixeira.' : 'Não dá para desfazer.'}`, ok: 'Apagar tanque', perigo: true, digitar: tanque.nome }))) return;
      const livre = ocupado('Apagando o tanque…');
      try {
        await ctx.api.excluirTanque(id);
        await ctx.atualizarRef(true);
      } finally { livre(); }
      ctx.toast('Tanque apagado', 'ok');
      location.hash = '#/tanques';
    } catch (e) { ctx.toast(e.message, 'erro'); }
  });

  const fn = el.querySelector('#f-nome');
  fn.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const e = fn.querySelector('#erro-nome'); e.hidden = true;
    const nome = fn.querySelector('#nome').value.trim();
    const ai = fn.querySelector('#area'), areaTxt = ai ? ai.value.trim() : '', areaV = areaHa(areaTxt);
    if (!nome) { e.textContent = 'Informe o nome.'; e.hidden = false; return; }
    if (areaTxt && !areaV) { e.textContent = 'Área inválida. Use hectares, ex.: 5,5'; e.hidden = false; return; }
    try {
      await ctx.api.renomearTanque(id, nome, ai ? areaV : undefined);
      await ctx.atualizarRef();
      ctx.toast('Salvo', 'ok');
      renderTanque(ctx, el, id);
    } catch (err) { e.textContent = err.message; e.hidden = false; }
  });
}
