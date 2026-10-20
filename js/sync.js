// Envio da fila offline para o Supabase.
// - Cada item já nasce com uuid_local (gerado no celular). Se o envio é repetido, o banco
//   recusa com 23505 (único) e tratamos como "já enviado": não duplica.
// - Rede caiu, sinal ruim ou servidor instável (5xx): para e mantém tudo na fila; nada é descartado.
//   O app tenta de novo sozinho (a cada 20 s com o app aberto, ao voltar a internet e ao reabrir).
// - Só envia itens do usuário logado (o banco exige registrado_por = auth.uid()).
import { filaList, filaPut, filaRemove } from './db.js';
import { ehErroDeRede, ehErroDeSessao, traduzErro } from './util.js';

const TABELAS = new Set(['biometrias', 'mortalidade', 'racao_consumo']);
let rodando = false;

export async function sincronizar(client, userId) {
  if (rodando) return { ocupado: true, enviados: 0, falhas: 0, semRede: false, sessaoExpirada: false };
  rodando = true;
  const r = { ocupado: false, enviados: 0, falhas: 0, semRede: false, sessaoExpirada: false };
  const tentados = new Set();
  try {
    // laço externo: pega também itens que entraram na fila enquanto sincronizava
    for (;;) {
      const itens = (await filaList()).filter((i) => i.registrado_por === userId && !tentados.has(i.uuid_local));
      if (!itens.length) break;
      for (const it of itens) {
        tentados.add(it.uuid_local);
        if (!TABELAS.has(it.tabela)) {
          it.status = 'erro'; it.erro = 'Tipo de lançamento desconhecido';
          await filaPut(it); r.falhas++;
          continue;
        }
        let error = null, status = 0;
        try {
          ({ error, status } = await client.from(it.tabela).insert(it.payload));
          // banco ainda sem a coluna "causa" (sql/08 não rodado): salva sem ela em vez de travar a fila
          if (error && it.payload.causa !== undefined && /causa/i.test(error.message || '')) {
            const { causa, ...semCausa } = it.payload;
            ({ error, status } = await client.from(it.tabela).insert(semCausa));
          }
        } catch (e) {
          error = { message: String((e && e.message) || e), code: '' };
        }
        if (!error || error.code === '23505') {
          await filaRemove(it.uuid_local);
          r.enviados++;
          continue;
        }
        // rede fora, sinal ruim ou servidor sobrecarregado/instável (5xx, 408, 429): é temporário.
        // Mantém o item como está (sem marcar erro) e tenta de novo mais tarde.
        if (ehErroDeRede(error) || status >= 500 || status === 408 || status === 429) { r.semRede = true; return r; }
        if (ehErroDeSessao(error)) { r.sessaoExpirada = true; return r; }
        it.status = 'erro';
        it.erro = traduzErro(error);
        it.tentativas = (it.tentativas || 0) + 1;
        await filaPut(it);
        r.falhas++;
      }
    }
  } finally {
    rodando = false;
  }
  return r;
}
