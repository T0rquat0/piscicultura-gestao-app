// Segurança da planilha (CSV): texto que começa com = + - @ não pode virar fórmula no Excel do dono.
// Ex.: um tanque chamado =HIPERLINK("site-falso";"Clique") viraria um link para um site falso.
// Rodar: node testes/calc/teste_seguranca_csv.mjs
import assert from 'node:assert/strict';
import { celulaCsv } from '../../js/util.js';
import { montarCsv } from '../../js/views/relatorio.js';

assert.equal(celulaCsv('=HIPERLINK("x";"y")'), `"'=HIPERLINK(""x"";""y"")"`, 'fórmula vira texto');
assert.equal(celulaCsv('+5595999'), `"'+5595999"`);
assert.equal(celulaCsv('@SOMA(A1)'), `"'@SOMA(A1)"`);
assert.equal(celulaCsv('- sem causa'), `"'- sem causa"`);
assert.equal(celulaCsv('-20,00'), '"-20,00"', 'número negativo continua número');
assert.equal(celulaCsv(-3), '"-3"');
assert.equal(celulaCsv('Tanque 1'), '"Tanque 1"');
assert.equal(celulaCsv(null), '""');
assert.equal(celulaCsv('a;b\nc'), '"a;b\nc"', 'ponto e vírgula e quebra de linha ficam dentro das aspas');

// planilha do lote de ponta a ponta, com nome de tanque e causa maliciosos
const lote = { data_entrada: '2026-09-01', quantidade_inicial: 1000, peso_inicial_kg: 50, especie: '=1+1', tipo: 'engorda' };
const calc = { vivos: 990, biomassaAtual: 500, ca: 1.2, sobrevivencia: 99 };
const csv = montarCsv(lote, '=HIPERLINK("http://falso";"Clique")', calc, [], [{ data: '2026-10-01', quantidade: 10, causa: '@cmd', registrado_por: 'u' }], [], () => '+Fulano');
const celulas = csv.replace(/^﻿/, '').split(/\r\n/).flatMap((l) => l.match(/"(?:[^"]|"")*"/g) || []);
const perigosas = celulas.filter((c) => /^"[=+@]/.test(c) || /^"-[^\d]/.test(c));
assert.deepEqual(perigosas, [], 'nenhuma célula da planilha do lote começa com fórmula: ' + perigosas.join(' '));
console.log('RESULTADO: TUDO OK (planilha sem fórmulas injetadas)');
