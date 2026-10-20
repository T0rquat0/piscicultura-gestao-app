// Configuração do projeto Supabase.
// A chave "anon public" é pública por desenho (fica no navegador de qualquer jeito);
// quem protege os dados é o RLS no banco. NUNCA coloque aqui a chave "service_role".
//
// UM BANCO POR ENDEREÇO DO SITE: o banco atual é de TESTE e DEMONSTRAÇÃO. Quando os clientes tiverem
// um banco só deles (ver docs/INFRA.md), crie o projeto no Supabase, rode os sql/ e acrescente aqui
// o endereço do site dos clientes com a URL e a chave pública (publishable/anon) desse projeto novo.
// Endereço que não estiver na lista usa o "padrao" (testes, prévias da Vercel e localhost).
const AMBIENTES = {
  padrao: { nome: 'testes e demonstração', url: 'https://ppvliseblxpsepmeknnl.supabase.co', chave: 'sb_publishable_ckz6Ih2NnJ_xOb4i4_ea8w_uBGQyW3t' },
  // 'app.seudominio.com.br': { nome: 'clientes', url: 'https://XXXXXXXX.supabase.co', chave: 'sb_publishable_XXXXXXXX' },
};
export function ambienteDo(host) {
  return AMBIENTES[String(host || '').toLowerCase()] || AMBIENTES.padrao;
}
const AMBIENTE = ambienteDo(typeof location !== 'undefined' ? location.hostname : '');
export const AMBIENTE_NOME = AMBIENTE.nome;
export const SUPABASE_URL = AMBIENTE.url;
export const SUPABASE_ANON_KEY = AMBIENTE.chave;

// Peso padrão de um saco de ração (kg), usado ao registrar compras.
export const PESO_SACO_PADRAO_KG = 25;

// Avisos de estoque: dias de ração restantes (no ritmo dos últimos 7 dias).
export const ESTOQUE_ATENCAO_DIAS = 15;
export const ESTOQUE_CRITICO_DIAS = 7;
// Sugestão de compra: quanto comprar para o estoque durar este número de dias no ritmo atual.
export const ESTOQUE_COBERTURA_DIAS = 30;
// Lembrar de contar o estoque quando a última contagem tiver este número de dias (ou mais).
export const CONTAGEM_LEMBRETE_DIAS = 7;
// Avisar o dono quando faltar este número de dias (ou menos) para o teste/plano vencer.
export const PLANO_AVISO_DIAS = 7;

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
];

// Termos de uso e política de privacidade (termos.html e privacidade.html).
// null = desligado: as páginas existem como MINUTA, mas o app não pede aceite nem mostra os links.
// Para ligar: preencha os dados da empresa nas duas páginas, revise com um advogado e coloque aqui a data
// da versão (ex.: '2026-11-01'). Quem já tem conta verá o pedido de aceite no próximo acesso;
// quem criar conta marca o aceite no cadastro. Mudou o texto? Troque a data: todos aceitam de novo.
export const TERMOS_VERSAO = null;
