// Lateral do computador: atalhos que no celular ficam em "Mais" e um resumo do dia sempre à vista.
// O resumo usa o que é barato (lotes, fila do aparelho, previsão do tempo guardada) e só 2 consultas
// ao servidor, guardadas por 1 minuto para não repetir a cada troca de tela.
import { esc, fmtInt, fmtNum, hojeISO, progresso } from './util.js';
import * as db from './db.js';
import { icone } from './icons.js';
import { situacaoEstoque, previsaoDespesca } from './calc.js';
import { descricao } from './clima.js';
import { ESTOQUE_ATENCAO_DIAS, ESTOQUE_CRITICO_DIAS, ESTOQUE_COBERTURA_DIAS, PESO_SACO_PADRAO_KG, ALVO_PADRAO_KG } from './config.js';

export function htmlAtalhos(state, gerir) {
  const p = state.perfil;
  const itens = [
    gerir && ['tanques', '#/tanques', 'tanque', 'Tanques e lotes'],
    ['estoque', '#/estoque', 'estoque', 'Estoque de ração'],
    p.papel === 'dono' && ['equipe', '#/equipe', 'equipe', 'Equipe'],
    p.papel === 'dono' && ['plano', '#/plano', 'check', 'Meu plano'],
    p.papel === 'dono' && ['historico', '#/historico', 'historico', 'Histórico e lixeira'],
  ].filter(Boolean);
  return `<nav class="lat-atalhos" aria-label="Atalhos"><p class="lat-rot">Atalhos</p>${itens.map(([rota, href, ic, txt]) => `<a data-rota="${rota}" href="${href}">${icone(ic, 17)}<span>${txt}</span></a>`).join('')}</nav>
    <section class="lat-hoje" id="lat-hoje" aria-label="Resumo de hoje"></section>`;
}

let cache = { em: 0, resumo: null, saldos: null };

export async function atualizarLateral(ctx) {
  const box = document.getElementById('lat-hoje');
  if (!box || !matchMedia('(min-width: 900px)').matches) return; // só existe no computador
  const { state } = ctx;
  const hoje = hojeISO();
  const { tanques, lotes } = state.ref;
  if (navigator.onLine && Date.now() - cache.em > 60000) {
    const [r, s] = await Promise.all([ctx.api.resumoLotes().catch(() => null), ctx.api.saldosRacao().catch(() => null)]);
    cache = { em: Date.now(), resumo: r || cache.resumo, saldos: s || cache.saldos };
  }
  const resumo = Object.fromEntries((cache.resumo || []).map((x) => [x.lote_id, x]));
  const fila = await db.filaList();
  const feitos = new Set(fila.filter((i) => i.tabela === 'racao_consumo' && i.payload.data === hoje).map((i) => i.payload.tanque_id));
  for (const l of lotes) if (resumo[l.id] && resumo[l.id].ultima_racao === hoje) feitos.add(l.tanque_id);
  const comLote = tanques.filter((t) => lotes.some((l) => l.tanque_id === t.id));
  const comeram = comLote.filter((t) => feitos.has(t.id)).length;
  const blocos = [];

  if (comLote.length) {
    blocos.push(`<a class="lat-item" href="#/"><span>Ração de hoje</span><b>${fmtInt(comeram)} de ${fmtInt(comLote.length)} <small>tanques</small></b>${progresso((comeram / comLote.length) * 100, { fina: true, tom: comeram === comLote.length ? 'ok' : '', rotulo: `${comeram} de ${comLote.length} tanques alimentados` })}</a>`);
  }
  const linha = cache.saldos && cache.saldos.linhas && cache.saldos.linhas[0];
  if (linha) {
    const kgS = state.ref.kgSaco || PESO_SACO_PADRAO_KG;
    const tot = cache.saldos.linhas.reduce((a, x) => a + Math.max(0, Number(x.saldo_kg) || 0), 0);
    const sit = situacaoEstoque(Number(linha.saldo_kg) || 0, linha.consumo_7d_kg, ESTOQUE_ATENCAO_DIAS, ESTOQUE_CRITICO_DIAS);
    const tom = { atencao: 'alerta', critico: 'erro', negativo: 'erro' }[sit.nivel] || '';
    blocos.push(`<a class="lat-item" href="#/estoque"><span>Estoque</span><b>${fmtInt(tot / kgS)} <small>sacos</small></b>${sit.dias != null ? `${progresso((sit.dias / ESTOQUE_COBERTURA_DIAS) * 100, { fina: true, tom, rotulo: `Dura ${Math.floor(sit.dias)} dias` })}<small>dura ~${fmtInt(Math.floor(sit.dias))} dias</small>` : ''}</a>`);
  }
  if (ctx.podeGerir() && cache.resumo) {
    const metas = (await db.kvGet('metasDespesca')) || {};
    const prox = lotes.map((l) => ({ l, p: previsaoDespesca(l, resumo[l.id], Number(metas[l.id]) || ALVO_PADRAO_KG[l.tipo] || ALVO_PADRAO_KG.engorda, hoje) }))
      .filter((x) => x.p.estado !== 'sem-dado').sort((a, b) => (a.p.estado === 'pronto' ? -1 : 0) - (b.p.estado === 'pronto' ? -1 : 0) || String(a.p.data).localeCompare(String(b.p.data)))[0];
    if (prox) {
      const nome = (tanques.find((t) => t.id === prox.l.tanque_id) || {}).nome || 'Tanque';
      const quando = prox.p.estado === 'pronto' ? 'já no peso' : new Date(`${prox.p.data}T12:00:00`).toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' }).replace('.', '');
      blocos.push(`<a class="lat-item" href="#/t/${esc(prox.l.tanque_id)}"><span>Próxima despesca</span><b>${esc(nome)}</b><small>${esc(quando)}</small></a>`);
    }
  }
  const clima = await db.kvGet('climaPrev');
  const dHoje = clima && clima.dias && clima.dias.find((d) => d.data === hoje);
  if (dHoje) blocos.push(`<a class="lat-item" href="#/"><span>Tempo hoje</span><b>${Math.round(dHoje.max)}° <small>mín. ${Math.round(dHoje.min)}°</small></b><small>${esc(descricao(dHoje.codigo))}${dHoje.chuva >= 1 ? ` · ${fmtNum(dHoje.chuva, 0)} mm` : ''}</small></a>`);

  box.innerHTML = blocos.length ? `<p class="lat-rot">Hoje</p>${blocos.join('')}` : '';
}

// marca o atalho da tela aberta (e tira o destaque de "Mais" quando o atalho já indica onde está)
export function marcarAtalho(rota) {
  let achou = false;
  document.querySelectorAll('.lat-atalhos a').forEach((a) => { const on = a.dataset.rota === rota; a.classList.toggle('on', on); if (on) achou = true; });
  if (achou) document.querySelectorAll('.lateral nav:not(.lat-atalhos) a[data-aba="mais"]').forEach((a) => a.classList.remove('on'));
}
