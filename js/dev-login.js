// Entrada automática SÓ para testes: nos links de pré-visualização do Vercel (PRs) e no localhost,
// o app entra sozinho com esta conta. Em produção (piscicultura-gestao-app.vercel.app e qualquer
// domínio próprio) NADA disso roda: o login continua obrigatório.
//
// Use uma conta de TESTE (ex.: uma fazenda de demonstração), nunca a de um cliente: este arquivo
// vai junto com o código. Deixe email/senha vazios para desligar.
export const DEV_LOGIN = { email: '', senha: '' };

const PROJETO = 'piscicultura-gestao-app';
export function ambienteDeTeste(host = location.hostname) {
  if (host === 'localhost' || host === '127.0.0.1') return true;
  return host.endsWith('.vercel.app') && host !== PROJETO + '.vercel.app' && host.startsWith(PROJETO + '-');
}
export const loginAutomaticoAtivo = (host) => !!(DEV_LOGIN.email && DEV_LOGIN.senha) && ambienteDeTeste(host);
