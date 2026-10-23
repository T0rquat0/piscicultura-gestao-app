// Previsão de despesca: meta por lote (guardada no aparelho; sem meta, o padrão da fase) e a barra peso atual ÷ meta.
import { esc, fmtInt, fmtNum, progresso } from '../util.js';
import { ALVO_PADRAO_KG } from '../config.js';

// meta de despesca de um lote: a guardada no aparelho ou o padrão da fase
export const metaDe = (l, metas) => Number((metas || {})[l.id]) || ALVO_PADRAO_KG[l.tipo] || ALVO_PADRAO_KG.engorda;
export const pesoTxt = (kg) => (kg < 1 ? `${fmtNum(kg * 1000, 0)} g` : `${fmtNum(kg, kg < 10 ? 1 : 0)} kg`);
export const dataCurta = (iso) => new Date(`${iso}T12:00:00`).toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' }).replace('.', '');

// linha de previsão de despesca (barra = peso atual ÷ meta)
export function htmlPrevisao(p) {
  const leg = p.estado === 'pronto' ? '<b>Já no peso de despesca</b>'
    : p.estado === 'previsto' ? `Previsão: <b>${esc(dataCurta(p.data))}</b> · ${p.dias === 0 ? 'hoje' : `em ${fmtInt(p.dias)} ${p.dias === 1 ? 'dia' : 'dias'}`}`
    : 'Faça uma biometria para prever a data';
  return `${progresso(p.pct || 0, { tom: p.estado === 'pronto' ? 'ok' : '', rotulo: `Peso ${pesoTxt(p.pmKg || 0)} de ${pesoTxt(p.alvoKg)}` })}
    <p class="h-trilho-leg"><span>${pesoTxt(p.pmKg || 0)} de ${pesoTxt(p.alvoKg)}</span><span>${leg}</span></p>`;
}
