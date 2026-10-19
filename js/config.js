// Configuração do projeto Supabase.
// A chave "anon public" é pública por desenho (fica no navegador de qualquer jeito);
// quem protege os dados é o RLS no banco. NUNCA coloque aqui a chave "service_role".
export const SUPABASE_URL = 'https://ppvliseblxpsepmeknnl.supabase.co';
export const SUPABASE_ANON_KEY = 'sb_publishable_ckz6Ih2NnJ_xOb4i4_ea8w_uBGQyW3t';

// Peso padrão de um saco de ração (kg), usado ao registrar compras.
export const PESO_SACO_PADRAO_KG = 25;

// Avisos de estoque: dias de ração restantes (no ritmo dos últimos 7 dias).
export const ESTOQUE_ATENCAO_DIAS = 15;
export const ESTOQUE_CRITICO_DIAS = 7;

// Tempo máximo (ms) esperando o servidor antes de considerar "sem conexão".
export const TIMEOUT_REDE_MS = 15000;
