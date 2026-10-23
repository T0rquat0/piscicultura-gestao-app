// Bloco "Tempo na fazenda" da Início: pede a localização uma vez, mostra 4 dias e os avisos de manejo.
import { esc, fmtNum } from '../util.js';
import { localGuardado, pedirLocal, previsao, descricao, avisosClima } from '../clima.js';

export async function pintarTempo(box, ctx, hoje) {
  if (!box) return;
  const cab = '<header><h2 id="h-tempo">Tempo na fazenda</h2><span class="h-meta">próximos dias</span></header>';
  const local = await localGuardado();
  if (!local) {
    box.innerHTML = `${cab}<p class="h-calmo">Veja a previsão do tempo e avisos de manejo (friagem, chuva forte, calor) para ajustar a ração.</p><button class="btn" id="b-tempo-ativar" type="button">Ativar previsão do tempo</button>`;
    box.querySelector('#b-tempo-ativar').addEventListener('click', async () => {
      try { await pedirLocal(); pintarTempo(box, ctx, hoje); } catch (e) { ctx.toast(e.message, 'erro'); }
    });
    return;
  }
  const pv = await previsao(local);
  if (!pv) { box.innerHTML = `${cab}<p class="h-calmo">Previsão indisponível agora. Tente de novo com internet.</p>`; return; }
  const dias = pv.dias.filter((d) => d.data >= hoje).slice(0, 4);
  const av = avisosClima(dias);
  const nomeDia = (d, i) => (i === 0 ? 'Hoje' : i === 1 ? 'Amanhã' : new Date(`${d}T12:00:00`).toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', ''));
  box.innerHTML = `${cab}
    <ul class="h-tempo">${dias.map((d, i) => `<li${i === 0 ? ' class="hoje"' : ''}><span>${esc(nomeDia(d.data, i))}</span><b>${Math.round(d.max)}°</b><small>mín. ${Math.round(d.min)}°</small><em>${esc(descricao(d.codigo))}${d.chuva >= 1 ? ` · ${fmtNum(d.chuva, 0)} mm` : ''}</em></li>`).join('')}</ul>
    ${av.length ? av.map((a) => `<p class="${a.nivel === 'alerta' ? 'h-alerta' : 'aviso'}">${esc(a.txt)}</p>`).join('') : '<p class="h-calmo">Sem aviso de manejo para hoje e amanhã.</p>'}`;
}
