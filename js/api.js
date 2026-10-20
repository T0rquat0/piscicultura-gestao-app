// Camada de acesso ao Supabase. Todas as funções lançam ErroApi (mensagem já em português).
import { uuid, traduzErro, hojeISO } from './util.js';

export class ErroApi extends Error {
  constructor(original) {
    super(traduzErro(original));
    this.original = original;
    this.code = original && original.code;
  }
}

const TABELAS_EXCLUIVEIS = new Set(['biometrias', 'mortalidade', 'racao_consumo', 'racao_estoque', 'racao_contagens']);
const TABELAS_EDITAVEIS = new Set(['biometrias', 'mortalidade', 'racao_consumo', 'racao_estoque', 'lotes']);

export function criarApi(client) {
  const ok = (res) => {
    if (res.error) throw new ErroApi(res.error);
    return res.data;
  };

  // o Supabase devolve no máximo 1000 linhas por consulta: pagina para não truncar totais
  async function todos(fazer) {
    const out = [];
    for (let i = 0; ; i += 1000) {
      const { data, error } = await fazer().range(i, i + 999);
      if (error) throw new ErroApi(error);
      out.push(...data);
      if (data.length < 1000) break;
    }
    return out;
  }

  return {
    // ----- perfil / referência -----
    async perfil(userId) {
      return ok(await client.from('usuarios').select('id,nome,papel,fazenda_id,ativo,fazendas(nome)').eq('id', userId).maybeSingle());
    },
    // plano da fazenda; null se o sql/07 ainda não foi rodado
    async plano() {
      const { data, error } = await client.rpc('plano_atual');
      return error ? null : (Array.isArray(data) ? data[0] : data) || null;
    },
    async pacotes() {
      const { data, error } = await client.from('pacotes').select('tanques_max,nome,preco_mensal').order('tanques_max');
      return error ? [] : data || [];
    },
    async contratarPacote(n) {
      return ok(await client.rpc('contratar_pacote', { p_tanques_max: n }));
    },
    async criarFazenda(fazenda, nome) {
      return ok(await client.rpc('criar_fazenda', { p_fazenda: fazenda, p_nome: nome }));
    },
    // fim do teste grátis; null se não houver (fazenda antiga) ou se o sql/06 não foi rodado
    async testeAte() {
      const { data, error } = await client.from('fazendas').select('teste_ate').maybeSingle();
      return error || !data ? null : data.teste_ate || null;
    },
    // peso do saco de ração da fazenda; null se a coluna ainda não existe (sql/03 não rodado)
    async kgSaco() {
      const { data, error } = await client.from('fazendas').select('kg_saco').maybeSingle();
      if (error || !data || !(Number(data.kg_saco) > 0)) return null;
      return Number(data.kg_saco);
    },
    async salvarKgSaco(fazendaId, kg) {
      ok(await client.from('fazendas').update({ kg_saco: kg }).eq('id', fazendaId));
    },
    // logo da fazenda (data URL); null se não há ou se o sql/09 ainda não foi rodado
    async logo() {
      const { data, error } = await client.from('fazendas').select('logo').maybeSingle();
      return error || !data || !data.logo ? null : data.logo;
    },
    async salvarLogo(fazendaId, dataUrl) {
      ok(await client.from('fazendas').update({ logo: dataUrl || null }).eq('id', fazendaId));
    },
    async tanques() {
      return ok(await client.from('tanques').select('id,nome').order('nome'));
    },
    async lotes({ apenasAtivos = false } = {}) {
      let q = client.from('lotes').select('id,tanque_id,tipo,especie,data_entrada,quantidade_inicial,peso_inicial_kg,ativo');
      if (apenasAtivos) q = q.eq('ativo', true);
      return ok(await q.order('data_entrada', { ascending: false }));
    },
    async lote(id) {
      return ok(await client.from('lotes').select('id,tanque_id,tipo,especie,data_entrada,quantidade_inicial,peso_inicial_kg,ativo,tanques(nome)').eq('id', id).maybeSingle());
    },
    async resumoLotes() {
      return ok(await client.rpc('resumo_lotes'));
    },

    // ----- tanques e lotes (dono/gerente) -----
    async criarTanque(fazendaId, nome) {
      const id = uuid(); // gerado aqui: o gerente só enxerga o tanque depois do gatilho que o vincula
      ok(await client.from('tanques').insert({ id, fazenda_id: fazendaId, nome }));
      return id;
    },
    async renomearTanque(id, nome) {
      ok(await client.from('tanques').update({ nome }).eq('id', id));
    },
    async criarLote(lote) {
      ok(await client.from('lotes').insert({ id: uuid(), ...lote }));
    },
    // exclusões definitivas (só o dono; o RLS barra os demais). Apagam em cascata os lançamentos.
    async excluirLote(id) {
      const d = ok(await client.from('lotes').delete().eq('id', id).select('id'));
      if (!d || !d.length) throw new Error('Não foi possível excluir. Só o dono pode excluir lotes.');
    },
    async excluirTanque(id) {
      const d = ok(await client.from('tanques').delete().eq('id', id).select('id'));
      if (!d || !d.length) throw new Error('Não foi possível excluir. Só o dono pode excluir tanques.');
    },
    async encerrarLote(id) {
      ok(await client.from('lotes').update({ ativo: false }).eq('id', id));
    },

    // lançamentos já gravados no mesmo dia (para avisar de duplicidade ao lançar)
    async registrosDoDia(tipo, pl) {
      if (tipo === 'racao') return ok(await client.from('racao_consumo').select('quantidade_kg,criado_em').eq('tanque_id', pl.tanque_id).eq('data', pl.data)) || [];
      const tab = tipo === 'mortalidade' ? 'mortalidade' : 'biometrias';
      return ok(await client.from(tab).select(tipo === 'mortalidade' ? 'quantidade,criado_em' : 'criado_em').eq('lote_id', pl.lote_id).eq('data', pl.data)) || [];
    },

    // ----- ração: estoque -----
    async saldoRacao() {
      const d = ok(await client.rpc('saldo_racao'));
      const s = Array.isArray(d) ? d[0] : d;
      // Banco sem o sql/04: a função antiga não devolve o consumo dos últimos 7 dias; calcula aqui.
      if (s && s.consumo_7d_kg == null) {
        try {
          const hoje = hojeISO();
          const d7 = new Date(`${hoje}T00:00:00Z`); d7.setUTCDate(d7.getUTCDate() - 7);
          const linhas = await todos(() => client.from('racao_consumo').select('id,quantidade_kg').gte('data', d7.toISOString().slice(0, 10)).lt('data', hoje).order('id'));
          s.consumo_7d_kg = linhas.reduce((t, r) => t + Number(r.quantidade_kg || 0), 0);
        } catch { /* segue sem estimativa */ }
      }
      return s;
    },
    async consumoDiario(dias = 30) {
      return ok(await client.rpc('consumo_diario', { p_dias: dias })) || [];
    },
    async contagens() {
      return ok(await client.from('racao_contagens').select('id,data,contado_kg,saldo_sistema_kg,diferenca_kg,obs,criado_em').order('criado_em', { ascending: false }).limit(30)) || [];
    },
    async registrarContagem(kg, obs) {
      return Number(ok(await client.rpc('registrar_contagem', { p_contado_kg: kg, p_obs: obs || null })));
    },
    async compras(podeGerir) {
      let lista;
      if (podeGerir) {
        lista = await todos(() => client.from('racao_estoque').select('id,data_compra,quantidade_kg,custo_total,fornecedor').order('data_compra', { ascending: false }).order('id'));
      } else {
        lista = ok(await client.rpc('racao_estoque_visivel'));
        lista.sort((a, b) => (a.data_compra < b.data_compra ? 1 : -1));
      }
      return lista;
    },
    async registrarCompra(c) {
      ok(await client.from('racao_estoque').insert({ id: uuid(), ...c }));
    },

    // ----- relatório de um lote -----
    async dadosLote(loteId) {
      const [bios, mort, rac] = await Promise.all([
        todos(() => client.from('biometrias').select('id,data,peso_amostra_kg,quantidade_amostrada,registrado_por').eq('lote_id', loteId).order('data').order('id')),
        todos(() => client.from('mortalidade').select('id,data,quantidade,causa,registrado_por').eq('lote_id', loteId).order('data').order('id'))
          .catch(() => todos(() => client.from('mortalidade').select('id,data,quantidade,registrado_por').eq('lote_id', loteId).order('data').order('id'))),
        todos(() => client.from('racao_consumo').select('id,data,quantidade_kg,registrado_por').eq('lote_id', loteId).order('data').order('id')),
      ]);
      return { bios, mort, rac };
    },
    // ração de todos os tanques visíveis ao usuário a partir de uma data (para a tabela dia × tanque)
    async racaoPeriodo(desde) {
      return todos(() => client.from('racao_consumo').select('id,data,tanque_id,quantidade_kg').gte('data', desde).order('data').order('id'));
    },
    // nomes de toda a equipe (sql/10). Sem o sql/10, cai na tabela: o funcionário só enxerga o próprio nome.
    async nomesUsuarios() {
      const r = await client.rpc('nomes_equipe');
      const lista = r.error ? ok(await client.from('usuarios').select('id,nome')) : r.data || [];
      return Object.fromEntries(lista.map((u) => [u.id, u.nome]));
    },
    async excluir(tabela, id) {
      if (!TABELAS_EXCLUIVEIS.has(tabela)) throw new Error('Tabela não permitida');
      ok(await client.from(tabela).delete().eq('id', id));
    },
    // corrige um registro (dono/gerente; o RLS barra os demais sem dar erro, por isso confere se alguma linha mudou)
    async atualizar(tabela, id, campos) {
      if (!TABELAS_EDITAVEIS.has(tabela)) throw new Error('Tabela não permitida');
      const d = ok(await client.from(tabela).update(campos).eq('id', id).select('id'));
      if (!d || !d.length) throw new Error('Não foi possível salvar. Sem permissão para alterar este registro.');
    },
    async reabrirLote(id) {
      const d = ok(await client.from('lotes').update({ ativo: true }).eq('id', id).select('id'));
      if (!d || !d.length) throw new Error('Não foi possível reabrir. Sem permissão para alterar este lote.');
    },

    // ----- equipe (dono) -----
    async equipe() {
      const [usuarios, vinculos] = await Promise.all([
        client.from('usuarios').select('id,nome,papel,ativo').order('nome'),
        client.from('usuario_tanques').select('usuario_id,tanque_id'),
      ]);
      return { usuarios: ok(usuarios), vinculos: ok(vinculos) };
    },
    async adicionarUsuario(email, nome, papel) {
      ok(await client.rpc('vincular_usuario_por_email', { p_email: email, p_nome: nome, p_papel: papel }));
    },
    async atualizarUsuario(id, campos) {
      ok(await client.from('usuarios').update(campos).eq('id', id));
    },
    // ----- convites por link (sql/10) -----
    async convitesAbertos() {
      const { data, error } = await client.from('convites').select('token,papel,criado_em,expira_em')
        .is('usado_em', null).eq('cancelado', false).gt('expira_em', new Date().toISOString()).order('criado_em', { ascending: false });
      return error ? null : data || []; // null = sql/10 ainda não rodado
    },
    async criarConvite(papel) {
      return ok(await client.rpc('criar_convite', { p_papel: papel }));
    },
    async cancelarConvite(token) {
      ok(await client.rpc('cancelar_convite', { p_token: token }));
    },
    async verConvite(token) {
      const d = ok(await client.rpc('ver_convite', { p_token: token }));
      return Array.isArray(d) ? d[0] : d;
    },
    async aceitarConvite(token, nome) {
      return ok(await client.rpc('aceitar_convite', { p_token: token, p_nome: nome }));
    },
    async salvarVinculos(usuarioId, adicionar, remover) {
      if (adicionar.length) ok(await client.from('usuario_tanques').insert(adicionar.map((t) => ({ usuario_id: usuarioId, tanque_id: t }))));
      if (remover.length) ok(await client.from('usuario_tanques').delete().eq('usuario_id', usuarioId).in('tanque_id', remover));
    },
  };
}
