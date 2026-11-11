// Contas do financeiro do SISTEMA (painel do administrador): quanto entrou, quanto saiu e a parte de cada sócio.
// Sem tela aqui: só números, para poder testar com conta conferida à mão.

const cent = (v) => Math.round((Number(v) || 0) * 100);
const real = (c) => c / 100;
const dentro = (d, ini, fim) => (!ini || d >= ini) && (!fim || d <= fim);

// Entradas de um período: cobranças pagas (já vêm sem as do piloto) + receitas lançadas à mão.
export function resumoPeriodo({ lancamentos = [], recebimentos = [], ini = null, fim = null }) {
  let rec = 0, man = 0, desp = 0, ret = 0;
  for (const r of recebimentos) if (dentro(r.data, ini, fim)) rec += cent(r.valor);
  for (const l of lancamentos) {
    if (!dentro(l.data, ini, fim)) continue;
    if (l.tipo === 'receita') man += cent(l.valor);
    else if (l.tipo === 'despesa') desp += cent(l.valor);
    else if (l.tipo === 'retirada') ret += cent(l.valor);
  }
  return { cobrancas: real(rec), receitasManuais: real(man), receitas: real(rec + man), despesas: real(desp), resultado: real(rec + man - desp), retiradas: real(ret) };
}

// Acerto entre sócios, desde o começo:
//   parte   = percentual x (receitas - despesas)
//   pagou   = despesas que o sócio pagou do próprio bolso (o caixa deve devolver)
//   retirou = o que ele já tirou do caixa
//   saldo   = parte + pagou - retirou   (positivo: ainda tem a receber; negativo: tirou a mais)
// caixa = receitas - despesas pagas pelo caixa - retiradas  (= soma dos saldos)
export function acertoSocios({ lancamentos = [], recebimentos = [], socios = [] }) {
  const t = resumoPeriodo({ lancamentos, recebimentos });
  const resultado = cent(t.resultado);
  const ativos = socios.filter((s) => s.ativo !== false);
  const somaPct = ativos.reduce((a, s) => a + Number(s.percentual || 0), 0);
  const linhas = socios.map((s) => ({ id: s.id, nome: s.nome, percentual: Number(s.percentual || 0), ativo: s.ativo !== false, parte: 0, pagou: 0, retirou: 0 }));
  // divide em centavos; a sobra do arredondamento vai para o primeiro ativo (a soma sempre bate)
  let distribuido = 0;
  const lAtivos = linhas.filter((l) => l.ativo);
  for (const l of lAtivos) { l.parte = somaPct ? Math.floor((resultado * l.percentual) / somaPct) : 0; distribuido += l.parte; }
  if (lAtivos.length) lAtivos[0].parte += resultado - distribuido;
  let despCaixa = 0, ret = 0;
  for (const x of lancamentos) {
    const l = linhas.find((y) => y.id === x.socio_id);
    if (x.tipo === 'despesa') { if (l) l.pagou += cent(x.valor); else despCaixa += cent(x.valor); }
    if (x.tipo === 'retirada') { ret += cent(x.valor); if (l) l.retirou += cent(x.valor); }
  }
  const receitas = cent(t.receitas);
  return {
    socios: linhas.map((l) => ({ ...l, parte: real(l.parte), pagou: real(l.pagou), retirou: real(l.retirou), saldo: real(l.parte + l.pagou - l.retirou) })),
    caixa: real(receitas - despCaixa - ret),
    somaPercentual: somaPct,
  };
}

// Situação de um cliente pagante pela data até quando está pago (5 dias de carência, como no banco).
export function situacaoCliente(pagoAte, hoje) {
  if (!pagoAte) return { rotulo: 'Sem data', classe: '', dias: null };
  const dias = Math.round((Date.parse(pagoAte + 'T12:00:00Z') - Date.parse(hoje + 'T12:00:00Z')) / 86400000);
  if (dias < -5) return { rotulo: 'Vencido', classe: 'erro', dias };
  if (dias < 0) return { rotulo: 'Em carência', classe: 'alerta', dias };
  if (dias <= 7) return { rotulo: dias === 0 ? 'Vence hoje' : `Vence em ${dias} ${dias === 1 ? 'dia' : 'dias'}`, classe: 'alerta', dias };
  return { rotulo: 'Em dia', classe: 'ok', dias };
}

// Receita mensal recorrente: soma da mensalidade de quem está com o pagamento em dia (sem contar a carência).
export const receitaMensal = (clientes, hoje) => real(clientes.filter((c) => !c.bloqueada && c.pago_ate >= hoje).reduce((a, c) => a + cent(c.mensal), 0));

// Primeiro e último dia de um mês 'AAAA-MM'.
export function limitesMes(mes) {
  const [a, m] = mes.split('-').map(Number);
  const ult = new Date(Date.UTC(a, m, 0)).getUTCDate();
  return { ini: `${mes}-01`, fim: `${mes}-${String(ult).padStart(2, '0')}` };
}

// CPF (11) ou CNPJ (14) com dígitos verificadores certos; aceita com ou sem pontuação. Igual ao banco (sql/31).
export function documentoValido(v) {
  const d = String(v || '').replace(/\D/g, '');
  const dv = (base, pesos) => { const s = pesos.reduce((a, p, i) => a + Number(base[i]) * p, 0); const r = s % 11; return r < 2 ? 0 : 11 - r; };
  if (d.length === 11) {
    if (/^(\d)\1{10}$/.test(d)) return false;
    const d1 = ((d.slice(0, 9).split('').reduce((a, n, i) => a + Number(n) * (10 - i), 0) * 10) % 11) % 10;
    const d2 = ((d.slice(0, 10).split('').reduce((a, n, i) => a + Number(n) * (11 - i), 0) * 10) % 11) % 10;
    return d1 === Number(d[9]) && d2 === Number(d[10]);
  }
  if (d.length === 14) {
    if (/^(\d)\1{13}$/.test(d)) return false;
    return dv(d, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]) === Number(d[12]) && dv(d, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]) === Number(d[13]);
  }
  return false;
}

export function fmtDocumento(v) {
  const d = String(v || '').replace(/\D/g, '');
  if (d.length === 11) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
  if (d.length === 14) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
  return d;
}
