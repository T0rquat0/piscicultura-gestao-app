// Painel do administrador do SISTEMA (sql/15): todas as fazendas, cobranças e pacotes.
// Só aparece para quem está na tabela administradores; o banco confere de novo em cada ação.
import { confirmar, formulario } from '../dialogo.js';
import { icone } from '../icons.js';
import { esc, fmtData, fmtBRL, fmtInt, num, plural } from '../util.js';

const voltar = `<p><a class="voltar" href="#/mais">${icone('voltar', 18)} Mais</a></p>`;
const ESTADO = {
  teste: ['Em teste', 'ok'], teste_acabou: ['Teste acabou', 'erro'], ativo: ['Pagante', 'ok'],
  carencia: ['Em carência', 'alerta'], vencido: ['Vencido', 'erro'], livre: ['Sem limite', ''],
};
const FILTROS = [['todas', 'Todas'], ['teste', 'Em teste'], ['ativo', 'Pagantes'], ['atencao', 'Vencidas'], ['bloqueada', 'Bloqueadas']];

function situacao(f) {
  if (f.bloqueada) return { rotulo: 'Bloqueada', classe: 'erro', grupo: 'bloqueada' };
  const p = f.plano || {}; const [rotulo, classe] = ESTADO[p.estado] || ['—', ''];
  const grupo = p.estado === 'teste' ? 'teste' : p.estado === 'ativo' ? 'ativo' : ['carencia', 'vencido', 'teste_acabou'].includes(p.estado) ? 'atencao' : 'outra';
  return { rotulo, classe, grupo };
}

export async function renderAdmin(ctx, el, aba = 'fazendas', estado = { filtro: 'todas', busca: '' }) {
  if (!ctx.state.admin) { el.innerHTML = '<div class="card vazio">Somente administradores do sistema.</div>'; return; }
  el.innerHTML = `${voltar}<h1>Administração</h1><p class="carregando">Carregando…</p>`;
  if (!navigator.onLine) { el.innerHTML = `${voltar}<h1>Administração</h1><div class="card vazio">Precisa de internet.</div>`; return; }
  const [fazendas, cobrancas, pacotes, config] = await Promise.all([
    ctx.api.adminFazendas(), ctx.api.adminCobrancas(), ctx.api.adminPacotes(), ctx.api.adminConfig(),
  ]);
  const pendentes = cobrancas.filter((c) => c.status === 'pendente');
  const conta = (g) => fazendas.filter((f) => situacao(f).grupo === g).length;
  const recarregar = (novaAba = aba) => renderAdmin(ctx, el, novaAba, estado);

  const abaFazendas = () => `
      <div class="kpis adm-kpis">
        <div class="kpi"><span>Fazendas</span><b>${fazendas.length}</b></div>
        <div class="kpi"><span>Em teste</span><b>${conta('teste')}</b></div>
        <div class="kpi"><span>Pagantes</span><b>${conta('ativo')}</b></div>
        <div class="kpi"><span>Vencidas / bloqueadas</span><b>${conta('atencao') + conta('bloqueada')}</b></div>
      </div>
      <label class="adm-busca">Procurar <input id="adm-busca" type="search" placeholder="Fazenda, dono ou e-mail" value="${esc(estado.busca)}"></label>
      <div class="adm-filtros">${FILTROS.map(([k, r]) => `<button type="button" class="chip${estado.filtro === k ? ' on' : ''}" data-filtro="${k}">${r}</button>`).join('')}</div>
      <div id="adm-lista">${listaFazendas()}</div>`;
  const listaFazendas = () => {
    const termo = estado.busca.trim().toLowerCase();
    const lista = fazendas.filter((f) => (estado.filtro === 'todas' || situacao(f).grupo === estado.filtro)
      && (!termo || [f.nome, f.dono_nome, f.dono_email].some((x) => String(x || '').toLowerCase().includes(termo))));
    return `${lista.length ? lista.map((f) => {
        const s = situacao(f), p = f.plano || {};
        const validade = f.bloqueada ? '' : p.valido_ate ? ` até ${fmtData(p.valido_ate)}` : '';
        return `<article class="card adm-faz" data-faz="${esc(f.id)}">
          <header><b>${esc(f.nome)}</b><span class="tag ${s.classe}">${esc(s.rotulo)}${esc(validade)}</span></header>
          <small>${esc(f.dono_nome || 'sem dono')}${f.dono_email ? ` · ${esc(f.dono_email)}` : ''}</small>
          <small>Entrou em ${fmtData(f.criado_em)} · ${plural(f.pessoas, 'pessoa', 'pessoas')} · ${plural(f.tanques, 'tanque', 'tanques')}, ${fmtInt(p.em_uso || 0)} em uso${p.limite ? ` de ${p.limite}` : ''}</small>
          <small>Último lançamento de ração: ${f.ultimo_lancamento ? fmtData(f.ultimo_lancamento) : 'nenhum'}</small>
          <div class="acoes">
            <button class="btn mini" data-estender="${esc(f.id)}" type="button">Estender teste</button>
            ${f.bloqueada ? `<button class="btn mini" data-liberar="${esc(f.id)}" type="button">Liberar</button>`
              : `<button class="btn mini perigo" data-bloquear="${esc(f.id)}" type="button">Bloquear</button>`}
          </div>
        </article>`;
      }).join('') : '<div class="card vazio">Nenhuma fazenda neste filtro.</div>'}`;
  };

  const abaCobrancas = () => `
    <h2>Pendentes <span class="contagem">${pendentes.length}</span></h2>
    ${pendentes.length ? pendentes.map((c) => `<article class="card adm-cob">
        <header><b>${esc(c.fazenda)}</b><b>${fmtBRL(c.valor)}</b></header>
        <small>Pacote de ${fmtInt(c.tanques_max)} tanques · pedido em ${fmtData(c.criada_em)}${c.origem ? ` · ${esc(c.origem)}` : ''}</small>
        <div class="acoes"><button class="btn mini primario" data-pagar="${esc(c.id)}" type="button">Marcar como paga</button></div>
      </article>`).join('') : '<div class="card vazio">Nenhuma cobrança pendente.</div>'}
    <h2>Últimos 60 dias</h2>
    <div class="card">${cobrancas.filter((c) => c.status !== 'pendente').length ? `<ul class="lista">${cobrancas.filter((c) => c.status !== 'pendente').map((c) => `
      <li><div class="esq"><b>${esc(c.fazenda)}</b><small>${fmtInt(c.tanques_max)} tanques · ${fmtBRL(c.valor)} · ${c.status === 'paga' ? `paga em ${fmtData(c.paga_em)}` : 'cancelada'}</small></div>
      <span class="tag ${c.status === 'paga' ? 'ok' : ''}">${c.status === 'paga' ? 'Paga' : 'Cancelada'}</span></li>`).join('')}</ul>` : '<p class="mudo" style="margin:0">Nada nos últimos 60 dias.</p>'}</div>`;

  const abaPacotes = () => `
    <div class="card adm-piloto${config.modo_piloto ? ' ligado' : ''}">
      <b>Modo piloto: ${config.modo_piloto ? 'LIGADO' : 'desligado'}</b>
      <small>${config.modo_piloto ? 'Contratar um pacote libera 12 meses na hora, sem cobrar. Desligue antes de ter cliente pagante.' : 'Contratar um pacote cria uma cobrança pendente; ela libera o pacote quando for marcada como paga.'}</small>
      <div class="acoes"><button class="btn mini ${config.modo_piloto ? 'perigo' : ''}" id="b-piloto" type="button">${config.modo_piloto ? 'Desligar modo piloto' : 'Ligar modo piloto'}</button></div>
    </div>
    <h2>Pacotes</h2>
    <div class="card"><ul class="lista">${pacotes.map((p) => `
      <li><div class="esq"><b>${esc(p.nome)}</b><small>até ${fmtInt(p.tanques_max)} tanques · ${fmtBRL(p.preco_mensal)} por mês</small></div>
        ${p.ativo ? '' : '<span class="tag">Inativo</span>'}<button class="btn mini" data-pacote="${p.tanques_max}" type="button">Editar</button></li>`).join('')}</ul>
      <div class="acoes"><button class="btn" id="b-novo-pacote" type="button">Novo pacote</button></div></div>
    <p class="mudo nota">Pacote inativo não aparece para os donos, mas quem já tem continua com ele.</p>`;

  el.innerHTML = `
    ${voltar}
    <h1>Administração</h1>
    <div class="seg" style="--n:3" role="tablist">
      <button type="button" data-aba="fazendas" class="${aba === 'fazendas' ? 'on' : ''}">Fazendas</button>
      <button type="button" data-aba="cobrancas" class="${aba === 'cobrancas' ? 'on' : ''}">Cobranças${pendentes.length ? ` (${pendentes.length})` : ''}</button>
      <button type="button" data-aba="pacotes" class="${aba === 'pacotes' ? 'on' : ''}">Pacotes</button>
    </div>
    <div id="adm-corpo">${aba === 'cobrancas' ? abaCobrancas() : aba === 'pacotes' ? abaPacotes() : abaFazendas()}</div>`;

  el.querySelectorAll('[data-aba]').forEach((b) => b.addEventListener('click', () => recarregar(b.dataset.aba)));
  const acao = async (fn, msg) => { try { const r = await fn(); ctx.toast(typeof msg === 'function' ? msg(r) : msg, 'ok'); recarregar(); } catch (e) { ctx.toast(e.message, 'erro'); } };
  const fazPor = (id) => fazendas.find((f) => f.id === id);

  // ---- fazendas ----
  // busca e filtros redesenham só a lista (o campo de busca fica, com o cursor onde estava)
  const redesenharLista = () => { el.querySelector('#adm-lista').innerHTML = listaFazendas(); ligarFazendas(); };
  const busca = el.querySelector('#adm-busca');
  if (busca) busca.addEventListener('input', () => { estado.busca = busca.value; redesenharLista(); });
  el.querySelectorAll('[data-filtro]').forEach((b) => b.addEventListener('click', () => {
    estado.filtro = b.dataset.filtro;
    el.querySelectorAll('[data-filtro]').forEach((x) => x.classList.toggle('on', x === b));
    redesenharLista();
  }));
  function ligarFazendas() {
    el.querySelectorAll('[data-estender]').forEach((b) => b.addEventListener('click', async () => {
      const f = fazPor(b.dataset.estender);
      const v = await formulario({
        titulo: `Estender teste: ${f.nome}`, texto: f.teste_ate ? `O teste vai até ${fmtData(f.teste_ate)}. Os dias somam a partir do que falta (ou de hoje, se já acabou).` : 'Esta fazenda não tem teste grátis; os dias contam a partir de hoje.',
        campos: [{ nome: 'dias', rotulo: 'Quantos dias a mais?', tipo: 'number', valor: 15, step: '1', min: '1', max: '365', inputmode: 'numeric' }],
        validar: (x) => (Number.isInteger(num(x.dias)) && num(x.dias) >= 1 && num(x.dias) <= 365 ? null : 'Informe de 1 a 365 dias.'),
        ok: 'Estender',
      });
      if (v) acao(() => ctx.api.adminEstenderTeste(f.id, num(v.dias)), (ate) => `Teste estendido até ${fmtData(ate)}`);
    }));
    el.querySelectorAll('[data-bloquear]').forEach((b) => b.addEventListener('click', async () => {
      const f = fazPor(b.dataset.bloquear);
      if (!(await confirmar({ titulo: `Bloquear ${f.nome}?`, texto: 'Ninguém desta fazenda consegue ver nem lançar nada até você liberar. Os dados continuam guardados.', ok: 'Bloquear', perigo: true, digitar: f.nome }))) return;
      acao(() => ctx.api.adminBloquear(f.id, true), 'Fazenda bloqueada');
    }));
    el.querySelectorAll('[data-liberar]').forEach((b) => b.addEventListener('click', async () => {
      const f = fazPor(b.dataset.liberar);
      if (!(await confirmar({ titulo: `Liberar ${f.nome}?`, texto: 'A fazenda volta a funcionar como antes.', ok: 'Liberar' }))) return;
      acao(() => ctx.api.adminBloquear(f.id, false), 'Fazenda liberada');
    }));
  }
  ligarFazendas();

  // ---- cobranças ----
  el.querySelectorAll('[data-pagar]').forEach((b) => b.addEventListener('click', async () => {
    const c = cobrancas.find((x) => x.id === b.dataset.pagar);
    const v = await formulario({
      titulo: `Marcar como paga: ${c.fazenda}`, texto: `Pacote de ${c.tanques_max} tanques, ${fmtBRL(c.valor)} por mês. Confira se o dinheiro entrou antes de confirmar.`,
      campos: [{ nome: 'meses', rotulo: 'Quantos meses foram pagos?', tipo: 'number', valor: c.meses || 1, step: '1', min: '1', max: '24', inputmode: 'numeric' }],
      validar: (x) => (Number.isInteger(num(x.meses)) && num(x.meses) >= 1 && num(x.meses) <= 24 ? null : 'Informe de 1 a 24 meses.'),
      ok: 'Confirmar pagamento',
    });
    if (v) acao(() => ctx.api.adminConfirmarPagamento(c.id, num(v.meses)), 'Pagamento confirmado: pacote liberado');
  }));

  // ---- pacotes ----
  const bp = el.querySelector('#b-piloto');
  if (bp) bp.addEventListener('click', async () => {
    const ligar = !config.modo_piloto;
    if (!(await confirmar({ titulo: ligar ? 'Ligar o modo piloto?' : 'Desligar o modo piloto?', texto: ligar ? 'Contratar um pacote volta a liberar 12 meses na hora, sem cobrança.' : 'A partir de agora, contratar um pacote cria uma cobrança pendente, que só libera quando você marcar como paga (ou quando o pagamento automático existir).', ok: ligar ? 'Ligar' : 'Desligar', perigo: ligar }))) return;
    acao(() => ctx.api.adminDefinirPiloto(ligar), ligar ? 'Modo piloto ligado' : 'Modo piloto desligado');
  });
  const editarPacote = async (p) => {
    const novo = !p;
    const v = await formulario({
      titulo: novo ? 'Novo pacote' : `Editar: ${p.nome}`,
      campos: [
        ...(novo ? [{ nome: 'tanques', rotulo: 'Até quantos tanques?', tipo: 'number', step: '1', min: '1', inputmode: 'numeric' }] : []),
        { nome: 'nome', rotulo: 'Nome', tipo: 'text', valor: novo ? '' : p.nome, maxlength: '60' },
        { nome: 'preco', rotulo: 'Preço por mês (R$)', tipo: 'number', valor: novo ? '' : p.preco_mensal, step: '0.01', min: '0', inputmode: 'decimal' },
        { nome: 'ativo', rotulo: 'Aparece para os donos?', tipo: 'select', valor: novo || p.ativo ? 'sim' : 'nao', opcoes: [['sim', 'Sim, ativo'], ['nao', 'Não, inativo']] },
      ],
      validar: (x) => (novo && !(Number.isInteger(num(x.tanques)) && num(x.tanques) >= 1) ? 'Informe até quantos tanques (número inteiro).'
        : novo && pacotes.some((q) => q.tanques_max === num(x.tanques)) ? 'Já existe um pacote com esse número de tanques: use Editar.'
        : !x.nome.trim() ? 'Informe o nome.' : !(num(x.preco) >= 0) ? 'Informe o preço.' : null),
    });
    if (v) acao(() => ctx.api.adminSalvarPacote({ tanques_max: novo ? num(v.tanques) : p.tanques_max, nome: v.nome.trim(), preco: num(v.preco), ativo: v.ativo === 'sim' }), 'Pacote salvo');
  };
  el.querySelectorAll('[data-pacote]').forEach((b) => b.addEventListener('click', () => editarPacote(pacotes.find((p) => p.tanques_max === Number(b.dataset.pacote)))));
  const bn = el.querySelector('#b-novo-pacote'); if (bn) bn.addEventListener('click', () => editarPacote(null));
}
