// Cada endereço do site usa o banco certo: o dos clientes só no endereço dos clientes; o resto vai para o de testes.
// Rodar: node testes/calc/teste_ambientes.mjs
import assert from 'node:assert/strict';
import { ambienteDo } from '../../js/config.js';
assert.equal(ambienteDo('pisciapp-gestao.vercel.app').nome, 'clientes');
assert.match(ambienteDo('pisciapp-gestao.vercel.app').url, /ljunnpmszkkgoqmtvxse/);
assert.equal(ambienteDo('PISCIAPP-GESTAO.vercel.app').nome, 'clientes', 'maiúsculas não mudam o banco');
for (const h of ['piscicultura-gestao-app.vercel.app', 'localhost', '127.0.0.1', 'piscicultura-ge-git-abc-pisci-app.vercel.app', ''])
  assert.equal(ambienteDo(h).nome, 'testes e demonstração', `${h || '(vazio)'} usa o banco de testes`);
assert.ok(!/service_role|sb_secret/.test(JSON.stringify(ambienteDo('pisciapp-gestao.vercel.app'))), 'só chave pública');
console.log('RESULTADO: TUDO OK (cada endereço no seu banco)');
