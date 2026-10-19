// Camada de acesso ao Supabase. Todas as funções lançam ErroApi (mensagem já em português).
import { uuid, traduzErro } from './util.js';

export class ErroApi extends Error {
  constructor(original) {
    super(traduzErro(original));
    this.original = original;
    this.code = original && original.code;
  }
}

const TABELAS_EXCLUIVEIS = new Set(['biometrias', 'mortalidade', 'racao_consumo', 'racao_estoque']);

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
    async encerrarLote(id) {
      ok(await client.from('lotes').update({ ativo: false }).eq('id', id));
    },

    // ----- ração: estoque -----
    async saldoRacao() {
      const d = ok(await client.rpc('saldo_racao'));
      return Array.isArray(d) ? d[0] : d;
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
        todos(() => client.from('mortalidade').select('id,data,quantidade,registrado_por').eq('lote_id', loteId).order('data').order('id')),
        todos(() => client.from('racao_consumo').select('id,data,quantidade_kg,registrado_por').eq('lote_id', loteId).order('data').order('id')),
      ]);
      return { bios, mort, rac };
    },
    async nomesUsuarios() {
      const lista = ok(await client.from('usuarios').select('id,nome'));
      return Object.fromEntries(lista.map((u) => [u.id, u.nome]));
    },
    async excluir(tabela, id) {
      if (!TABELAS_EXCLUIVEIS.has(tabela)) throw new Error('Tabela não permitida');
      ok(await client.from(tabela).delete().eq('id', id));
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
    async salvarVinculos(usuarioId, adicionar, remover) {
      if (adicionar.length) ok(await client.from('usuario_tanques').insert(adicionar.map((t) => ({ usuario_id: usuarioId, tanque_id: t }))));
      if (remover.length) ok(await client.from('usuario_tanques').delete().eq('usuario_id', usuarioId).in('tanque_id', remover));
    },
  };
}
