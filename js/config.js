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

// Dias de teste grátis para fazendas novas (o valor que vale é o do banco; este é só o texto da tela).
export const TESTE_DIAS = 30;

// Espécies mais criadas (a última opção "Outra" deixa a pessoa digitar).
export const ESPECIES = ['Tambaqui', 'Tambacu', 'Tilápia', 'Matrinxã', 'Pirarucu', 'Pintado', 'Pacu', 'Curimatã', 'Carpa'];

// Causa provável da morte dos peixes: [rótulo, dica curta para quem está no tanque].
export const CAUSAS_MORTE = [
  ['Falta de oxigênio', 'peixes boquejando na superfície'],
  ['Temperatura', 'água muito quente ou muito fria'],
  ['Doença ou parasitas', 'manchas, feridas, nadando estranho'],
  ['Qualidade da água', 'água verde, suja ou com cheiro forte'],
  ['Predadores', 'aves, lontra, jacaré'],
  ['Manejo', 'despesca, transporte, estresse'],
  ['Não sei', 'não deu para saber'],
];
