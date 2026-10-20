import { esc, ROTULO_PAPEL, fmtData, hojeISO, diasEntre } from '../util.js';
import { icone } from '../icons.js';
import { confirmar } from '../dialogo.js';
import { num, fmtNum } from '../util.js';
import { PESO_SACO_PADRAO_KG } from '../config.js';
import { reduzirLogo } from '../util.js';

export function renderMais(ctx, el) {
  const { state } = ctx;
  const p = state.perfil;
  const gerir = ctx.podeGerir();
  const itens = [
    gerir && ['#/tanques', 'tanque', 'Tanques e lotes', 'Cadastrar tanques e lotes de peixes'],
    p.papel === 'dono' && ['#/plano', 'check', 'Meu plano', 'Pacote de tanques e prazo'],
    ['#/estoque', 'estoque', 'Estoque de ração', gerir ? 'Saldo, compras e custos' : 'Saldo de ração'],
    p.papel === 'dono' && ['#/equipe', 'equipe', 'Equipe', 'Pessoas, papéis e tanques liberados'],
    p.papel === 'dono' && ['#/historico', 'historico', 'Histórico e lixeira', 'Quem alterou ou excluiu, e restaurar'],
    state.admin && ['#/admin', 'admin', 'Administração do sistema', 'Todas as fazendas, cobranças e pacotes'],
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

    ${p.papel === 'dono' ? `<div class="card">
      <b>Logo da fazenda</b>
      <small style="display:block">Aparece no cabeçalho dos relatórios em PDF. Sem logo, usamos a marca do sistema.</small>
      <div class="logo-previa"><span class="caixa">${state.ref.logo ? `<img src="${esc(state.ref.logo)}" alt="">` : icone('peixe', 40)}</span>
        <div class="acoes" style="margin:0"><button class="btn" id="b-logo" type="button">${state.ref.logo ? 'Trocar logo' : 'Enviar logo'}</button>
        ${state.ref.logo ? '<button class="btn perigo" id="b-logo-x" type="button">Remover</button>' : ''}</div></div>
      <input id="in-logo" type="file" accept="image/*" hidden></div>` : ''}

    ${p.papel === 'dono' ? `<div class="card">
      <b>Cópia de segurança dos dados</b>
      <small style="display:block">Baixa um arquivo com tudo da fazenda: tanques, lotes, lançamentos, compras, contagens e equipe. Guarde no Google Drive ou no e-mail.</small>
      <div class="acoes"><button class="btn" id="b-copia" type="button">Baixar cópia dos dados</button><button class="btn" id="b-importar" type="button">Importar cópia</button></div>
      <small class="mudo" style="display:block">Importar devolve o que estiver faltando (por exemplo, depois de apagar algo sem querer). Nada que já existe é alterado.</small>
      <input id="in-copia" type="file" accept=".json,application/json" hidden></div>` : ''}

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
  const salvarLogo = async (dataUrl, msg) => {
    if (!navigator.onLine) return ctx.toast('Sem internet', 'erro');
    try {
      await ctx.api.salvarLogo(state.perfil.fazenda_id, dataUrl);
      if (dataUrl && !(await ctx.api.logo())) return ctx.toast('Falta rodar o sql/09 no Supabase.', 'erro');
      await ctx.atualizarRef(true); ctx.recarregarTopo(); ctx.toast(msg, 'ok'); renderMais(ctx, el);
    } catch (e) { ctx.toast(/logo/.test(e.message || '') && /column|schema/.test(e.message || '') ? 'Falta rodar o sql/09 no Supabase (coluna do logo).' : 'Não salvou: ' + e.message, 'erro'); }
  };
  const inLogo = el.querySelector('#in-logo');
  if (inLogo) {
    el.querySelector('#b-logo').addEventListener('click', () => inLogo.click());
    inLogo.addEventListener('change', async () => {
      const f = inLogo.files && inLogo.files[0]; if (!f) return;
      try { await salvarLogo(await reduzirLogo(f), 'Logo salva'); } catch (e) { ctx.toast(e.message || 'Imagem inválida', 'erro'); }
    });
    const x = el.querySelector('#b-logo-x');
    if (x) x.addEventListener('click', () => salvarLogo(null, 'Logo removida'));
  }
  const bcop = el.querySelector('#b-copia');
  if (bcop) bcop.addEventListener('click', async () => {
    if (!navigator.onLine) return ctx.toast('Sem internet', 'erro');
    bcop.disabled = true; const txt = bcop.textContent; bcop.textContent = 'Preparando…';
    try {
      const dados = await ctx.api.exportarTudo();
      const n = Object.values(dados.tabelas).reduce((s, l) => s + l.length, 0);
      const nome = `copia-${((p.fazendas && p.fazendas.nome) || 'fazenda').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\W+/g, '-').toLowerCase()}-${hojeISO()}.json`;
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([JSON.stringify(dados, null, 1)], { type: 'application/json' }));
      a.download = nome; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
      ctx.toast(`Cópia baixada: ${n} registro(s)`, 'ok');
    } catch (e) { ctx.toast('Não foi possível gerar a cópia: ' + e.message, 'erro'); }
    bcop.disabled = false; bcop.textContent = txt;
  });
  const bimp = el.querySelector('#b-importar'), incop = el.querySelector('#in-copia');
  if (bimp) bimp.addEventListener('click', () => { if (!navigator.onLine) return ctx.toast('Sem internet', 'erro'); incop.value = ''; incop.click(); });
  if (incop) incop.addEventListener('change', async () => {
    const arq = incop.files && incop.files[0]; if (!arq) return;
    let copia;
    try { copia = JSON.parse(await arq.text()); } catch { return ctx.toast('Este arquivo não é uma cópia do app.', 'erro'); }
    if (!copia || typeof copia.tabelas !== 'object' || Array.isArray(copia.tabelas)) return ctx.toast('Este arquivo não é uma cópia do app.', 'erro');
    const qtd = (t) => (Array.isArray(copia.tabelas[t]) ? copia.tabelas[t].length : 0);
    const resumo = `${qtd('tanques')} tanque(s), ${qtd('lotes')} lote(s), ${qtd('racao_consumo') + qtd('biometrias') + qtd('mortalidade')} lançamento(s) e ${qtd('racao_estoque')} compra(s)`;
    if (!(await confirmar({ titulo: 'Importar esta cópia?', texto: `Cópia de ${copia.gerado_em ? fmtData(copia.gerado_em) : 'data desconhecida'} com ${resumo}. Só volta o que estiver faltando; nada que já existe é alterado.`, ok: 'Importar' }))) return;
    bimp.disabled = true;
    try {
      const r = await ctx.api.importarCopia(copia);
      const n = Object.values(r).reduce((s, v) => s + Number(v || 0), 0);
      await ctx.atualizarRef(true);
      ctx.toast(n ? `${n} registro(s) voltaram para a fazenda` : 'Nada para importar: tudo da cópia já está na fazenda.', 'ok');
    } catch (e) { ctx.toast(e.message, 'erro'); }
    bimp.disabled = false;
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
