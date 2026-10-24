// Auditoria das contas (js/calc.js) com milhares de entradas geradas ao acaso, sempre com a mesma semente.
// Dois níveis:
//  - REALISTA: dados como o banco pode devolver (números >= 0, zero, vazios onde a coluna aceita, datas fora de ordem,
//    mais mortos que peixes, pesagem antes da entrada...). Aqui NADA pode dar erro, NaN, Infinity ou "Invalid Date".
//  - LIXO: valores que o banco não devolveria (texto no lugar de número, datas inválidas). Aqui só não pode dar erro.
// Uso: node testes/calc/teste_calc_extremos.mjs
import * as C from '../../js/calc.js';
import { TAXA_RACAO, ALERTAS, ALVO_PADRAO_KG } from '../../js/config.js';
import { avisosClima, descricao } from '../../js/clima.js';

let semente = 20261024;
const rnd = () => { semente = (semente * 1103515245 + 12345) % 2147483648; return semente / 2147483648; };
const um = (lista) => lista[Math.floor(rnd() * lista.length)];
const inteiro = (a, b) => a + Math.floor(rnd() * (b - a + 1));

const dataReal = () => {
  const d = new Date(Date.UTC(2024, 0, 1) + inteiro(0, 6 * 365) * 864e5);
  return d.toISOString().slice(0, 10);
};
const numReal = () => um([0, 0, 1, 0.001, 0.005, 0.05, 0.25, 0.5, 1.1, 1.5, 2.3, 3, 25, 1000, 43000, 98000, 1e6, rnd() * 3, rnd() * 50000]);
const qtdReal = () => um([0, 1, 2, 3, 7, 11, 100, 5200, 18441, 43000, 100000, inteiro(0, 200000)]);
const LIXO = [null, undefined, '', 'abc', NaN, -1, -0.5, Infinity, '12,5', {}, [], '2026-13-45', 'ontem'];
const ou = (gen, lixo) => (lixo && rnd() < 0.25 ? um(LIXO) : gen());

function loteAleatorio(lixo, id) {
  const q = ou(qtdReal, lixo);
  const pm = ou(numReal, lixo);
  return {
    id, tanque_id: 'T' + inteiro(1, 4), tipo: um(['bercario', 'alevinagem', 'recria', 'engorda', lixo ? 'xyz' : 'engorda']),
    especie: 'Tambaqui', ativo: rnd() < 0.7, data_entrada: ou(dataReal, lixo),
    quantidade_inicial: q, peso_inicial_kg: typeof q === 'number' && typeof pm === 'number' ? Math.round(q * pm * 100) / 100 : ou(numReal, lixo),
  };
}
const lista = (n, f) => Array.from({ length: n }, (_, i) => f(i));
const bioAleat = (lixo, lid) => ({ data: ou(dataReal, lixo), peso_amostra_kg: ou(numReal, lixo), quantidade_amostrada: ou(() => inteiro(0, 60), lixo), lote_id: lid });
const morteAleat = (lixo, lid) => ({ data: ou(dataReal, lixo), quantidade: ou(() => inteiro(0, 500), lixo), lote_id: lid, causa: um([null, 'Oxigênio']) });
const racAleat = (lixo, lid) => ({ data: ou(dataReal, lixo), quantidade_kg: ou(numReal, lixo), lote_id: lid, tanque_id: 'T' + inteiro(1, 4) });
const resumoAleat = (lixo) => ({
  ultimo_peso_medio_kg: rnd() < 0.3 ? null : ou(numReal, lixo), ultima_biometria: rnd() < 0.3 ? null : ou(dataReal, lixo),
  mortos: ou(() => inteiro(0, 200000), lixo), racao_kg: ou(numReal, lixo), ultima_racao: rnd() < 0.5 ? null : ou(dataReal, lixo),
});

// procura NaN / Infinity / "Invalid Date" / "NaN" em qualquer canto do resultado
function ruim(v, caminho = 'resultado', vistos = new Set()) {
  if (typeof v === 'number') return Number.isFinite(v) ? null : `${caminho} = ${v}`;
  if (typeof v === 'string') return /NaN|Invalid Date|Infinity|undefined/.test(v) ? `${caminho} = "${v}"` : null;
  if (v && typeof v === 'object' && !vistos.has(v)) {
    vistos.add(v);
    for (const [k, x] of Object.entries(v)) { const r = ruim(x, `${caminho}.${k}`, vistos); if (r) return r; }
  }
  return null;
}

const falhas = {};
let chamadas = 0;
function checa(nome, nivel, fn, entrada) {
  chamadas++;
  let saida;
  try { saida = fn(); } catch (e) { (falhas[`${nome} [${nivel}] ERRO`] ||= []).push({ erro: e.message, entrada }); return; }
  if (nivel === 'REALISTA') { const r = ruim(saida); if (r) (falhas[`${nome} [${nivel}] valor ruim`] ||= []).push({ r, entrada }); }
}

const RODADAS = 4000;
for (let i = 0; i < RODADAS; i++) {
  for (const nivel of ['REALISTA', 'LIXO']) {
    const lixo = nivel === 'LIXO';
    const hoje = ou(dataReal, lixo);
    const lote = loteAleatorio(lixo, 'L' + i);
    const bios = lista(inteiro(0, 6), () => bioAleat(lixo, lote.id)).sort((a, b) => String(a.data).localeCompare(String(b.data)));
    const mort = lista(inteiro(0, 6), () => morteAleat(lixo, lote.id));
    const rac = lista(inteiro(0, 10), () => racAleat(lixo, lote.id));
    const preco = rnd() < 0.3 ? null : ou(numReal, lixo);
    const r = resumoAleat(lixo);
    const alvo = rnd() < 0.2 ? ou(numReal, lixo) : (ALVO_PADRAO_KG[lote.tipo] || 2.5);
    const e = { lote, bios, mort, rac, hoje, preco, r, alvo };
    checa('pesoMedioKg', nivel, () => bios.map(C.pesoMedioKg).filter((x) => x != null), e);
    checa('calcularLote', nivel, () => C.calcularLote(lote, bios, mort, rac, hoje, preco), e);
    checa('pontosPeso', nivel, () => C.pontosPeso(lote, bios), e);
    checa('evolucaoPeso', nivel, () => C.evolucaoPeso(lote, bios), e);
    checa('racaoPorSemana', nivel, () => C.racaoPorSemana(rac), e);
    checa('previsaoDespesca', nivel, () => C.previsaoDespesca(lote, r, alvo, hoje), e);
    checa('fimDoLote', nivel, () => C.fimDoLote(lote, bios, mort, rac, hoje), e);
    checa('calcularNaIdade', nivel, () => C.calcularNaIdade(lote, bios, mort, rac, ou(() => inteiro(0, 400), lixo), preco), e);
    checa('precoMedioKg', nivel, () => C.precoMedioKg(lista(inteiro(0, 4), () => ({ custo_total: rnd() < 0.3 ? null : ou(numReal, lixo), quantidade_kg: ou(numReal, lixo) }))), e);
    checa('situacaoEstoque', nivel, () => C.situacaoEstoque(lixo ? um(LIXO) : um([-500, 0, 1, 25000, rnd() * 1e5]), ou(numReal, lixo)), e);
    checa('sugestaoCompraKg', nivel, () => C.sugestaoCompraKg(ou(numReal, lixo), ou(numReal, lixo), 30), e);
    const lotes = lista(inteiro(0, 5), (k) => loteAleatorio(lixo, `M${i}_${k}`));
    const resumo = Object.fromEntries(lotes.filter(() => rnd() < 0.8).map((l) => [l.id, resumoAleat(lixo)]));
    checa('sugestaoRacao', nivel, () => C.sugestaoRacao(lotes, resumo, TAXA_RACAO), { lotes, resumo });
    const racaoHoje = Object.fromEntries(['T1', 'T2', 'T3'].map((t) => [t, ou(numReal, lixo)]));
    const mediaSemana = Object.fromEntries(['T1', 'T2', 'T3'].filter(() => rnd() < 0.7).map((t) => [t, ou(numReal, lixo)]));
    const mortes = lista(inteiro(0, 12), () => morteAleat(lixo, um(lotes.length ? lotes : [{ id: 'x' }]).id));
    checa('alertasManejo', nivel, () => C.alertasManejo({ lotes, resumo, racaoHoje, mediaSemana, mortes, hoje, cfg: ALERTAS }), { lotes, resumo, racaoHoje, mediaSemana, mortes, hoje });
    checa('mediaDe', nivel, () => C.mediaDe(lista(inteiro(0, 5), () => ({ v: ou(numReal, lixo) })), 'v'), e);
    const temp = () => (rnd() < 0.15 ? null : um([-5, 0, 12, 19.9, 20, 25, 34.9, 35, 41, rnd() * 45]));
    const diasT = lista(inteiro(0, 4), () => ({ data: dataReal(), min: lixo ? um([...LIXO, temp()]) : temp(), max: lixo ? um([...LIXO, temp()]) : temp(), chuva: rnd() < 0.15 ? null : um([0, 1, 29.9, 30, 120]), codigo: um([0, 2, 3, 45, 51, 63, 81, 95, null, 999]) }));
    checa('avisosClima', nivel, () => avisosClima(diasT), diasT);
    // dia sem valor (null) não pode virar aviso com "0 °C" nem "0 mm"
    // dia sem valor (null) não pode gerar o aviso daquele valor (null viraria 0 °C / 0 mm)
    if (!lixo) checa('avisosClima sem valor', nivel, () => {
      const a = avisosClima(diasT);
      ['hoje', 'amanhã'].forEach((quando, k) => {
        const d = diasT[k]; if (!d) return;
        const tem = (ini) => a.some((x) => x.txt.startsWith(`${ini} ${quando}`));
        if (d.min == null && tem('Friagem')) throw new Error(`friagem ${quando} com mínima vazia`);
        if (d.chuva == null && tem('Chuva forte')) throw new Error(`chuva forte ${quando} com chuva vazia`);
        if (d.max == null && tem('Calor forte')) throw new Error(`calor ${quando} com máxima vazia`);
      });
      if (a.some((x) => x.txt.startsWith('A temperatura cai')) && (!diasT[0] || !diasT[1] || diasT[0].min == null || diasT[1].min == null)) throw new Error('queda de temperatura com mínima vazia');
      return a;
    }, diasT);
    checa('descricao', nivel, () => diasT.map((d) => descricao(d.codigo)), diasT);
    if (C.matrizRacao) checa('matrizRacao', nivel, () => C.matrizRacao(rac, ['T1', 'T2', 'T3', 'T4'], lista(7, (k) => dataReal()), hoje), e);
  }
}

const nomes = Object.keys(falhas);
console.log(`${chamadas} chamadas às contas (${RODADAS} rodadas × 2 níveis)`);
for (const n of nomes) {
  console.log(`FALHA ${n}: ${falhas[n].length} caso(s). Exemplo: ${JSON.stringify(falhas[n][0]).slice(0, 600)}`);
}
console.log('RESULTADO:', nomes.length ? `${nomes.length} PROBLEMA(S)` : 'TUDO OK');
process.exit(nomes.length ? 1 : 0);
