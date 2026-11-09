// 10 mil possibilidades (ou mais) para CADA problema corrigido em 24/10/2026, sempre com a mesma semente.
// Cada parte compara o app com uma conta de referência escrita aqui, separada, para pegar resposta ERRADA
// (não só erro): previsão de despesca, datas, avisos do tempo e o destino do botão de voltar.
// Uso: node testes/calc/teste_10mil.mjs
import { previsaoDespesca, somarDias, inicioSemana, racaoPorSemana, calcularNaIdade, alertasManejo } from '../../js/calc.js';
import { avisosClima } from '../../js/clima.js';
import { ALERTAS, CLIMA } from '../../js/config.js';
import { registrarRota, destinoVoltar, reiniciarPilha, ehAbaPrincipal, marcarVoltando } from '../../js/voltar.js';

const N = 10000;
let semente = 2410;
const rnd = () => { semente = (semente * 1103515245 + 12345) % 2147483648; return semente / 2147483648; };
const um = (l) => l[Math.floor(rnd() * l.length)];
const int = (a, b) => a + Math.floor(rnd() * (b - a + 1));
const utc = (iso) => { const [y, m, d] = iso.split('-').map(Number); return Date.UTC(y, m - 1, d); };
const isoDe = (ms) => new Date(ms).toISOString().slice(0, 10);
const dataAleat = () => isoDe(Date.UTC(2023, 0, 1) + int(0, 8 * 365) * 864e5);
const valida = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && isoDe(utc(s)) === s;

const resultado = {};
const falha = (p, msg, entrada) => { const r = (resultado[p] ||= { n: 0, falhas: [] }); r.falhas.push({ msg, entrada }); };
const conta = (p) => { (resultado[p] ||= { n: 0, falhas: [] }).n++; };
const tenta = (p, entrada, fn) => { conta(p); try { fn(); } catch (e) { falha(p, 'ERRO: ' + e.message, entrada); } };

// ---------- 1) previsão de despesca ----------
for (let i = 0; i < N; i++) {
  const q = um([0, 1, 3, 6, 11, 100, 5200, 18441, 43000, 98000, int(1, 200000)]);
  const pmEnt = um([0, 0.005, 0.05, 0.25, 0.5, 1.1, 1.5, 1.54, 1.8, 2.3, rnd() * 3]);
  const peso = Math.round(q * pmEnt * 100) / 100; // o banco guarda 2 casas
  const entrada = dataAleat();
  // peso de hoje: igual ao da entrada (lote em andamento), um fio acima, crescimento normal, menor, zero ou vazio
  const pm = um([null, 0, pmEnt, pmEnt * (1 + 1e-12), pmEnt + 0.0000001, pmEnt + rnd() * 2, pmEnt * 0.9, q ? peso / q : 0]);
  const bio = um([null, entrada, dataAleat(), isoDe(utc(entrada) + int(1, 400) * 864e5)]);
  const r = rnd() < 0.1 ? null : { ultimo_peso_medio_kg: pm, ultima_biometria: bio, mortos: int(0, q + 50) };
  const alvo = um([0.005, 0.05, 0.8, 2.5, 3, rnd() * 4 + 0.001]);
  const hoje = dataAleat();
  const lote = { data_entrada: entrada, quantidade_inicial: q, peso_inicial_kg: peso };
  const e = { lote, r, alvo, hoje };
  tenta('1. previsão de despesca', e, () => {
    const p = previsaoDespesca(lote, r, alvo, hoje);
    if (!['pronto', 'previsto', 'sem-dado'].includes(p.estado)) throw new Error('estado ' + p.estado);
    if (p.estado === 'previsto') {
      if (!valida(p.data)) throw new Error('data inválida ' + p.data);
      if (!(p.dias >= 0 && Number.isInteger(p.dias))) throw new Error('dias ' + p.dias);
      // referência: crescimento por dia desde a entrada; a data é o primeiro dia em que o peso alcança a meta
      const pmIni = peso / q, pmHoje = Number(r.ultimo_peso_medio_kg);
      const gpd = (pmHoje - pmIni) / ((utc(r.ultima_biometria) - utc(entrada)) / 864e5);
      const falta = (utc(p.data) - utc(r.ultima_biometria)) / 864e5;
      if (falta < 0 || falta > 3650) throw new Error('falta fora de 0..3650: ' + falta);
      if (!(gpd >= 0.0001)) throw new Error('previu sem crescimento real (gpd ' + gpd + ')');
      if (pmHoje + gpd * falta < alvo - 1e-9) throw new Error('na data prevista ainda não chegou na meta');
      if (falta >= 1 && pmHoje + gpd * (falta - 1) >= alvo + 1e-9) throw new Error('data prevista tarde demais');
      const esperadoDias = Math.max(0, Math.round((utc(p.data) - utc(hoje)) / 864e5));
      if (p.dias !== esperadoDias) throw new Error(`dias ${p.dias} ≠ ${esperadoDias}`);
    }
    if (p.estado === 'pronto' && !(p.pmKg >= alvo)) throw new Error('pronto abaixo da meta');
    if (p.pct != null && !(p.pct >= 0 && p.pct <= 100)) throw new Error('pct ' + p.pct);
  });
}

// ---------- 2) datas (válidas e inválidas) ----------
const LIXO_DATA = [null, undefined, '', 'ontem', '2026-13-45', '2026-02-30', '12/10/2026', 0, -1, NaN, {}, '2026-1-5', '9999-99-99'];
for (let i = 0; i < N; i++) {
  const boa = rnd() < 0.6;
  const d = boa ? dataAleat() : um(LIXO_DATA);
  const n = um([0, 1, -1, 7, -7, 30, 365, 3650, -3650, int(-5000, 5000), NaN, Infinity, '3', null]);
  const e = { d, n };
  tenta('2. datas', e, () => {
    const r = somarDias(d, n);
    const esperado = valida(d) && Number.isFinite(Number(n)) && n !== null ? isoDe(utc(d) + Number(n) * 864e5) : null;
    // datas como 2026-02-30 o próprio JS "rola" para março: o app aceita igual ao Date; a referência só cobra quando a data é válida
    if (valida(d) && Number.isFinite(Number(n)) && n !== null) { if (r !== esperado) throw new Error(`somarDias ${r} ≠ ${esperado}`); }
    else if (r !== null && !valida(r)) throw new Error('somarDias devolveu data inválida ' + r);
    const s = inicioSemana(d);
    if (valida(d)) {
      if (!valida(s)) throw new Error('inicioSemana inválida ' + s);
      const dif = (utc(d) - utc(s)) / 864e5;
      if (new Date(utc(s)).getUTCDay() !== 1 || dif < 0 || dif > 6) throw new Error(`inicioSemana ${s} não é a segunda de ${d}`);
    } else if (s !== null && !valida(s)) throw new Error('inicioSemana devolveu lixo ' + s);
    const rac = Array.from({ length: int(0, 6) }, () => ({ data: rnd() < 0.7 ? dataAleat() : um(LIXO_DATA), quantidade_kg: um([0, 1, 25, null, '3']) }));
    const sem = racaoPorSemana(rac);
    const totalRef = rac.filter((x) => valida(x.data)).reduce((a, x) => a + (Number(x.quantidade_kg) || 0), 0);
    const totalApp = sem.reduce((a, x) => a + x.kg, 0);
    if (Math.abs(totalRef - totalApp) > 1e-9) throw new Error(`ração por semana somou ${totalApp}, esperado ${totalRef}`);
    if (sem.some((x) => !valida(x.inicio))) throw new Error('semana com data inválida');
    const lote = { data_entrada: d, quantidade_inicial: 100, peso_inicial_kg: 10 };
    const ni = calcularNaIdade(lote, [], [], [], int(0, 400), null);
    if (!valida(d) && ni !== null) throw new Error('calcularNaIdade sem data de entrada deveria ser null');
    alertasManejo({ lotes: [{ id: 'L', tanque_id: 'T', data_entrada: d }], resumo: {}, racaoHoje: {}, mediaSemana: {}, mortes: [{ data: d, lote_id: 'L', quantidade: 3 }], hoje: rnd() < 0.5 ? d : dataAleat(), cfg: ALERTAS });
  });
}

// ---------- 3) avisos do tempo: aviso aparece SE E SOMENTE SE deve ----------
const val = (v) => (v == null || v === '' ? null : Number.isFinite(Number(v)) ? Number(v) : null);
for (let i = 0; i < N; i++) {
  const temp = () => (rnd() < 0.2 ? null : um([-8, 0, 12, 19.4, 19.6, 20, 20.4, 25, 34.4, 34.6, 35, 41, rnd() * 50 - 5]));
  const dias = Array.from({ length: int(0, 4) }, () => ({ min: temp(), max: temp(), chuva: rnd() < 0.2 ? null : um([0, 1, 29.4, 29.6, 30, 30.5, 200, rnd() * 80]) }));
  tenta('3. avisos do tempo', dias, () => {
    const a = avisosClima(dias);
    const tem = (ini) => a.some((x) => x.txt.startsWith(ini));
    ['hoje', 'amanhã'].forEach((q, k) => {
      const d = dias[k]; if (!d) { if (tem(`Friagem ${q}`) || tem(`Chuva forte ${q}`) || tem(`Calor forte ${q}`)) throw new Error('aviso de dia que não existe'); return; }
      // regra: um aviso por tipo; se hoje já tem, o de amanhã do mesmo tipo não repete
      const cond = (dd, k2) => { if (!dd) return false; const v = k2 === 'min' ? val(dd.min) : k2 === 'max' ? val(dd.max) : val(dd.chuva); return v != null && (k2 === 'min' ? v < CLIMA.friagemMinC : k2 === 'max' ? v >= CLIMA.calorMaxC : v >= CLIMA.chuvaForteMm); };
      const deve = (k2) => cond(d, k2) && !(k === 1 && cond(dias[0], k2));
      if (tem(`Friagem ${q}`) !== deve('min')) throw new Error(`friagem ${q} errada (mín ${d.min})`);
      if (tem(`Chuva forte ${q}`) !== deve('chuva')) throw new Error(`chuva ${q} errada (${d.chuva})`);
      if (tem(`Calor forte ${q}`) !== deve('max')) throw new Error(`calor ${q} errado (máx ${d.max})`);
    });
    const h = dias[0] && val(dias[0].min), m = dias[1] && val(dias[1].min);
    if (tem('A temperatura cai') !== (h != null && m != null && h - m >= CLIMA.quedaC)) throw new Error('queda de temperatura errada');
    if (a.some((x) => /NaN|undefined|null|Infinity/.test(x.txt))) throw new Error('texto quebrado no aviso');
  });
}

// ---------- 4) botão de voltar: 10 mil caminhos de navegação ----------
const SUBS = ['#/estoque', '#/tanques', '#/tanque/A', '#/tanque/B', '#/t/A', '#/t/B', '#/equipe', '#/plano', '#/historico', '#/pendencias', '#/admin', '#/relatorio/racao', '#/relatorio/L1', '#/relatorio/L2'];
const ABAS = ['#/', '#/lancar', '#/relatorio', '#/mais'];
const partes = (h) => h.replace(/^#\/?/, '').split('?')[0].split('/');
const ir = (h) => { const [rota, ...p] = partes(h); registrarRota(h, rota, p); return rota; };
for (let i = 0; i < N; i++) {
  reiniciarPilha();
  // (a) caminho só para frente, sem repetir: o voltar tem de levar exatamente para a tela anterior, até a aba
  const inicio = um(ABAS); ir(inicio);
  const caminho = [inicio];
  const usados = new Set([inicio]);
  for (let k = 0; k < int(1, 6); k++) { const s = um(SUBS.filter((x) => !usados.has(x))); if (!s) break; usados.add(s); caminho.push(s); ir(s); }
  tenta('4. botão de voltar', caminho, () => {
    for (let k = caminho.length - 1; k >= 1; k--) {
      const rota = partes(caminho[k])[0];
      const [href] = destinoVoltar(rota);
      if (href !== caminho[k - 1]) throw new Error(`em ${caminho[k]} o voltar foi para ${href}, esperado ${caminho[k - 1]}`);
      marcarVoltando(); ir(href); // clicou no voltar
    }
  });
  // (b) passeio ao acaso (vai e volta, repete telas, troca de aba): o voltar nunca aponta para a própria tela
  //     e seguir o voltar sempre termina numa aba principal (sem ficar em círculo)
  reiniciarPilha();
  let atual = um([...ABAS, ...SUBS]); ir(atual);
  const passos = [atual];
  for (let k = 0; k < int(1, 15); k++) {
    const [rota, ...p] = partes(atual);
    if (!ehAbaPrincipal(rota, p) && rnd() < 0.35) { atual = destinoVoltar(rota)[0]; marcarVoltando(); } else atual = um(rnd() < 0.2 ? ABAS : SUBS);
    ir(atual); passos.push(atual);
  }
  tenta('4. botão de voltar', passos, () => {
    let h = atual, voltas = 0;
    while (true) {
      const [rota, ...p] = partes(h);
      if (ehAbaPrincipal(rota, p)) break;
      const [href] = destinoVoltar(rota);
      if (href === h) throw new Error('voltar aponta para a própria tela ' + h);
      marcarVoltando(); ir(href); h = href;
      if (++voltas > 40) throw new Error('voltar em círculo, não chega numa aba');
    }
  });
}

let ruim = 0;
for (const [p, r] of Object.entries(resultado)) {
  console.log(`${r.falhas.length ? 'FALHA' : 'OK   '} ${p}: ${r.n} possibilidades, ${r.falhas.length} falha(s)`);
  if (r.falhas.length) { ruim++; console.log('      ex.: ' + r.falhas[0].msg + ' | ' + JSON.stringify(r.falhas[0].entrada).slice(0, 400)); }
}
const menor = Math.min(...Object.values(resultado).map((r) => r.n));
if (menor < N) { ruim++; console.log(`FALHA algum problema teve só ${menor} possibilidades (mínimo ${N})`); }
console.log('RESULTADO:', ruim ? `${ruim} PROBLEMA(S)` : 'TUDO OK');
process.exit(ruim ? 1 : 0);
