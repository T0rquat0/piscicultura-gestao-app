// Envio da fila offline para o Supabase.
// - Cada item já nasce com uuid_local (gerado no celular). Se o envio é repetido, o banco
//   recusa com 23505 (único) e tratamos como "já enviado": não duplica.
// - Rede caiu, sinal ruim ou servidor instável (5xx): para e mantém tudo na fila; nada é descartado.
//   O app tenta de novo sozinho (a cada 20 s com o app aberto, ao voltar a internet e ao reabrir).
// - Só envia itens do usuário logado (o banco exige registrado_por = auth.uid()).
import { filaList, filaPut, filaRemove, kvGet, kvSet } from './db.js';

// Depois de enviar, anota o lançamento na cópia dos números guardada no aparelho (kv 'resumo').
// Sem isso, quem lança com sinal, fecha o app e abre no campo sem sinal via o tanque "sem ração":
// a cópia só se renovava quando a Início abria com sinal. Quando a Início abre com sinal, a cópia
// é trocada pelos números do banco, então uma diferença aqui dura pouco.
export async function anotarNoResumo(tabela, p) {
  try {
    const linhas = await kvGet('resumo');
    const r = Array.isArray(linhas) ? linhas.find((x) => x.lote_id === p.lote_id) : null;
    if (!r) return;
    const n = (v) => Number(v) || 0;
    if (tabela === 'racao_consumo') {
      r.racao_kg = n(r.racao_kg) + n(p.quantidade_kg);
      if (!r.ultima_racao || p.data > r.ultima_racao) r.ultima_racao = p.data;
    } else if (tabela === 'mortalidade') {
      r.mortos = n(r.mortos) + n(p.quantidade);
    } else if (tabela === 'despescas') {
      r.despescados = n(r.despescados) + n(p.quantidade);
    } else if (tabela === 'biometrias' && n(p.quantidade_amostrada) > 0 && (!r.ultima_biometria || p.data >= r.ultima_biometria)) {
      r.ultima_biometria = p.data;
      r.ultimo_peso_medio_kg = n(p.peso_amostra_kg) / n(p.quantidade_amostrada);
    } else return;
    await kvSet('resumo', linhas);
    if (tabela === 'racao_consumo') { // a lista de ração dos últimos dias (Início sem sinal) também
      const rac = await kvGet('racao14');
      if (Array.isArray(rac)) { rac.push({ data: p.data, tanque_id: p.tanque_id, lote_id: p.lote_id, quantidade_kg: p.quantidade_kg }); await kvSet('racao14', rac); }
    }
  } catch { /* sem armazenamento: só deixa de atualizar a cópia */ }
}
import { ehErroDeRede, ehErroDeSessao, traduzErro } from './util.js';

const TABELAS = new Set(['biometrias', 'mortalidade', 'racao_consumo', 'despescas']);
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
          if (!error) await anotarNoResumo(it.tabela, it.payload); // 23505 = já tinha ido antes: não soma de novo
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
