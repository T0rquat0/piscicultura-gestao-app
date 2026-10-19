// Lançamento de ração, biometria e mortalidade. Funciona sem internet:
// o item é gravado na fila local (IndexedDB) e enviado quando houver conexão.
import { esc, hojeISO, fmtData, fmtNum, num, uuid, ROTULO_TIPO } from '../util.js';
import * as db from '../db.js';

const TIPOS = {
  racao: { rotulo: 'Ração', tabela: 'racao_consumo' },
  biometria: { rotulo: 'Biometria', tabela: 'biometrias' },
  mortalidade: { rotulo: 'Mortalidade', tabela: 'mortalidade' },
};

function camposDoTipo(tipo) {
  if (tipo === 'racao') {
    return `<label>Quantidade de ração (kg)
      <input id="qtd" type="number" inputmode="decimal" step="0.01" min="0" placeholder="Ex.: 12,5" required></label>`;
  }
  if (tipo === 'biometria') {
    return `
      <div class="duas">
        <label>Peso total da amostra (kg)
          <input id="peso" type="number" inputmode="decimal" step="0.001" min="0" placeholder="Ex.: 2,4" required></label>
        <label>Nº de peixes na amostra
          <input id="amostra" type="number" inputmode="numeric" step="1" min="1" placeholder="Ex.: 10" required></label>
      </div>
      <div class="calc" id="pm">Peso médio: —</div>`;
  }
  return `<label>Quantidade de peixes mortos
    <input id="qtd" type="number" inputmode="numeric" step="1" min="1" placeholder="Ex.: 3" required></label>`;
}

export async function renderLancar(ctx, el, params = {}) {
  const { state } = ctx;
  const tipo = TIPOS[params.tipo] ? params.tipo : 'racao';
  const { tanques, lotes } = state.ref;

  if (!tanques.length) {
    el.innerHTML = `<h1>Lançar</h1><div class="card vazio"><p>Nenhum tanque disponível.${ctx.podeGerir() ? ' Cadastre um tanque primeiro.' : ' Peça ao gerente para liberar seus tanques.'}</p>${ctx.podeGerir() ? '<a class="btn primario" href="#/tanques">Ir para Tanques</a>' : ''}</div>`;
    return;
  }

  const ultimo = (await db.kvGet('ultimoTanque')) || '';
  const tanqueInicial = tanques.some((t) => t.id === params.tanque) ? params.tanque : (tanques.some((t) => t.id === ultimo) ? ultimo : tanques[0].id);
  const hoje = hojeISO();

  el.innerHTML = `
    <h1>Lançar</h1>
    <div class="seg" role="tablist">
      ${Object.entries(TIPOS).map(([k, v]) => `<button type="button" data-tipo="${k}" class="${k === tipo ? 'on' : ''}">${v.rotulo}</button>`).join('')}
    </div>
    <form id="f" class="form card" novalidate>
      <label>Tanque
        <select id="tanque">${tanques.map((t) => `<option value="${esc(t.id)}"${t.id === tanqueInicial ? ' selected' : ''}>${esc(t.nome)}</option>`).join('')}</select>
      </label>
      <label id="lote-wrap">Lote <select id="lote"></select></label>
      <label>Data <input id="data" type="date" value="${hoje}" max="${hoje}" required></label>
      ${camposDoTipo(tipo)}
      <p id="erro" class="erro" hidden></p>
      <button class="btn primario grande" type="submit">Salvar lançamento</button>
      <p class="mudo" style="margin:0;text-align:center">${navigator.onLine ? 'Será enviado ao servidor agora.' : 'Sem internet: será salvo no celular e enviado depois.'}</p>
    </form>`;

  el.querySelectorAll('.seg button').forEach((b) =>
    b.addEventListener('click', () => renderLancar(ctx, el, { tipo: b.dataset.tipo, tanque: el.querySelector('#tanque').value })));

  const f = el.querySelector('#f');
  const selTanque = f.querySelector('#tanque');
  const selLote = f.querySelector('#lote');
  const erro = f.querySelector('#erro');
  const mostrarErro = (m) => { erro.textContent = m; erro.hidden = false; };

  function montarLotes() {
    const doTanque = lotes.filter((l) => l.tanque_id === selTanque.value);
    if (!doTanque.length) {
      selLote.innerHTML = '<option value="">— sem lote ativo —</option>';
      selLote.disabled = true;
      mostrarErro('Este tanque não tem lote ativo. Peça ao gerente para cadastrar o lote.');
      return;
    }
    erro.hidden = true;
    selLote.disabled = false;
    selLote.innerHTML = doTanque.map((l) => `<option value="${esc(l.id)}">${esc(ROTULO_TIPO[l.tipo] || l.tipo)} · ${esc(l.especie)} · desde ${fmtData(l.data_entrada)}</option>`).join('');
  }
  selTanque.addEventListener('change', montarLotes);
  montarLotes();

  if (tipo === 'biometria') {
    const atualizaPm = () => {
      const p = num(f.querySelector('#peso').value), q = num(f.querySelector('#amostra').value);
      f.querySelector('#pm').textContent = p > 0 && q > 0 ? `Peso médio: ${fmtNum((p / q) * 1000, 0)} g por peixe` : 'Peso médio: —';
    };
    f.querySelector('#peso').addEventListener('input', atualizaPm);
    f.querySelector('#amostra').addEventListener('input', atualizaPm);
  }

  f.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    erro.hidden = true;
    const lote_id = selLote.value;
    const data = f.querySelector('#data').value;
    if (!lote_id) return mostrarErro('Selecione um tanque com lote ativo.');
    if (!data) return mostrarErro('Informe a data.');

    const id = uuid();
    const base = { uuid_local: id, lote_id, data, registrado_por: state.perfil.id };
    let payload;
    if (tipo === 'racao') {
      const q = num(f.querySelector('#qtd').value);
      if (!(q > 0)) return mostrarErro('Informe a quantidade de ração em kg (maior que zero).');
      payload = { ...base, tanque_id: selTanque.value, quantidade_kg: q };
    } else if (tipo === 'biometria') {
      const p = num(f.querySelector('#peso').value), q = num(f.querySelector('#amostra').value);
      if (!(p > 0)) return mostrarErro('Informe o peso total da amostra em kg.');
      if (!(q >= 1) || !Number.isInteger(q)) return mostrarErro('Informe quantos peixes foram pesados (número inteiro).');
      payload = { ...base, peso_amostra_kg: p, quantidade_amostrada: q };
    } else {
      const q = num(f.querySelector('#qtd').value);
      if (!(q >= 1) || !Number.isInteger(q)) return mostrarErro('Informe a quantidade de peixes mortos (número inteiro).');
      payload = { ...base, quantidade: q };
    }

    const btn = f.querySelector('button[type=submit]');
    btn.disabled = true;
    try {
      await db.filaAdd({
        uuid_local: id, tabela: TIPOS[tipo].tabela, payload,
        registrado_por: state.perfil.id, criado_em: new Date().toISOString(), status: 'pendente', erro: null, tentativas: 0,
      });
      await db.kvSet('ultimoTanque', selTanque.value);
    } catch (e) {
      btn.disabled = false;
      return mostrarErro('Não foi possível salvar no aparelho: ' + (e && e.message ? e.message : 'armazenamento indisponível'));
    }
    await ctx.atualizarPendentes();
    ctx.toast(navigator.onLine ? 'Salvo. Enviando…' : 'Salvo no celular. Será enviado quando houver internet.', 'ok');
    // limpa só os campos de quantidade; mantém tanque/data para o próximo lançamento
    f.querySelectorAll('#qtd, #peso, #amostra').forEach((i) => { i.value = ''; });
    const pm = f.querySelector('#pm'); if (pm) pm.textContent = 'Peso médio: —';
    btn.disabled = false;
    ctx.sincronizarAgora(); // em segundo plano; não trava a tela
  });
}
