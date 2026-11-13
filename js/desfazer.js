// "Desfazer" um lançamento logo depois de salvar (5 minutos). Vale para todos os papéis, menos despesca
// (a despesca total encerra o lote: essa só se corrige pelo Histórico, com o dono ou o gerente).
//  - Ainda no aparelho (não enviado): sai da fila e pronto.
//  - Já enviado: apaga no banco pelo código do aparelho (uuid_local). O banco deixa o funcionário apagar o que
//    ele mesmo lançou hoje (sql/33); a exclusão fica no Histórico, como qualquer outra.
import * as db from './db.js';
import { esperarEnvio, desanotarNoResumo } from './sync.js';

export const PRAZO_DESFAZER_MIN = 5;
const PRAZO_MS = PRAZO_DESFAZER_MIN * 60000;

// minutos que ainda restam para desfazer (0 = acabou o prazo ou não pode)
export function minutosParaDesfazer(tabela, criadoEm, agora = Date.now()) {
  if (tabela === 'despescas' || !criadoEm) return 0;
  const resta = new Date(criadoEm).getTime() + PRAZO_MS - agora;
  return resta > 0 ? Math.ceil(resta / 60000) : 0;
}

// Devolve 'aparelho' (saiu da fila) ou 'banco' (apagado no servidor). Lança Error com a mensagem para a pessoa.
export async function desfazerLancamento(ctx, { uuidLocal, tabela, payload, criadoEm }) {
  if (!minutosParaDesfazer(tabela, criadoEm)) throw new Error(`Passaram os ${PRAZO_DESFAZER_MIN} minutos para desfazer. Corrija o lançamento em Meus lançamentos.`);
  // se o envio estiver no meio, espera: assim sabemos se o item ainda está no aparelho ou já foi para o banco
  await esperarEnvio();
  const naFila = (await db.filaList()).some((i) => i.uuid_local === uuidLocal);
  if (naFila) {
    await db.filaRemove(uuidLocal);
    await ctx.atualizarPendentes();
    // um envio que já tinha lido a fila antes de removermos pode ter gravado o item: confere no banco
    if (navigator.onLine) {
      await esperarEnvio();
      try { if (await ctx.api.apagarPorUuid(tabela, uuidLocal)) await desanotarNoResumo(tabela, payload); } catch { /* sem sinal: nada foi gravado por esse caminho */ }
    }
    return 'aparelho';
  }
  if (!navigator.onLine) throw new Error('Este lançamento já foi enviado. Para desfazer, precisa de internet.');
  const n = await ctx.api.apagarPorUuid(tabela, uuidLocal);
  if (!n) throw new Error('Não foi possível desfazer: o lançamento já foi apagado ou você não tem permissão.');
  await desanotarNoResumo(tabela, payload);
  return 'banco';
}
