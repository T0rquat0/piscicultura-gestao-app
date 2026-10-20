// Mantém o Supabase acordado: o plano grátis pausa o projeto depois de ~7 dias sem uso.
// A Vercel chama este endereço uma vez por dia (ver "crons" no vercel.json). Faz uma leitura
// leve e inofensiva com a chave pública (a mesma de js/config.js, pública por desenho):
// não lê dado de fazenda nenhuma (o RLS devolve lista vazia para quem não está logado).
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://ppvliseblxpsepmeknnl.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'sb_publishable_ckz6Ih2NnJ_xOb4i4_ea8w_uBGQyW3t';

module.exports = async (req, res) => {
  const inicio = Date.now();
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/pacotes?select=tanques_max&limit=1`, {
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
    });
    res.status(r.ok ? 200 : 502).json({ ok: r.ok, supabase: r.status, ms: Date.now() - inicio });
  } catch (e) {
    res.status(502).json({ ok: false, erro: String((e && e.message) || e), ms: Date.now() - inicio });
  }
};
