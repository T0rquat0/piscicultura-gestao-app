// Mantém os bancos Supabase acordados: o plano grátis pausa o projeto depois de ~7 dias sem uso.
// A Vercel chama este endereço uma vez por dia (ver "crons" no vercel.json). Faz uma leitura leve e
// inofensiva com a chave pública de cada banco (a mesma de js/config.js, pública por desenho):
// não lê dado de fazenda nenhuma (o RLS devolve lista vazia para quem não está logado).
// Quando existir o banco dos clientes, acrescente-o aqui também (mesma URL e chave de js/config.js).
const PROJETOS = [
  { nome: 'testes e demonstração', url: 'https://ppvliseblxpsepmeknnl.supabase.co', chave: 'sb_publishable_ckz6Ih2NnJ_xOb4i4_ea8w_uBGQyW3t' },
  // { nome: 'clientes', url: 'https://XXXXXXXX.supabase.co', chave: 'sb_publishable_XXXXXXXX' },
];

module.exports = async (req, res) => {
  const resultados = await Promise.all(PROJETOS.map(async (p) => {
    const inicio = Date.now();
    try {
      const r = await fetch(`${p.url}/rest/v1/pacotes?select=tanques_max&limit=1`, {
        headers: { apikey: p.chave, Authorization: `Bearer ${p.chave}` },
      });
      return { banco: p.nome, ok: r.ok, supabase: r.status, ms: Date.now() - inicio };
    } catch (e) {
      return { banco: p.nome, ok: false, erro: String((e && e.message) || e), ms: Date.now() - inicio };
    }
  }));
  const tudoOk = resultados.every((r) => r.ok);
  res.status(tudoOk ? 200 : 502).json({ ok: tudoOk, bancos: resultados });
};
