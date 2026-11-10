// Qualidade da água: faixas do tambaqui (Tabela 1, "Criação de tambaqui", Embrapa 2018) e alerta na Início.
import assert from 'node:assert/strict';
import { avaliarAgua, alertasManejo, ehTambaqui } from '../../js/calc.js';

const niveis = (m) => avaliarAgua(m).map((x) => x.nivel);
assert.deepEqual(avaliarAgua({ oxigenio_mgl: 5, temperatura_c: 29, ph: 6.5, amonia_mgl: 0.1 }), []);
assert.deepEqual(avaliarAgua({ oxigenio_mgl: 4, temperatura_c: 28, ph: 5, amonia_mgl: 0.45 }), [], 'nos limites está dentro');
assert.deepEqual(avaliarAgua({ oxigenio_mgl: 8, temperatura_c: 30, ph: 7 }), []);
assert.deepEqual(niveis({ oxigenio_mgl: 3.9 }), ['critico']);
assert.deepEqual(niveis({ amonia_mgl: 0.46 }), ['critico'], 'o limite é "menor que 0,46"');
assert.deepEqual(niveis({ ph: 4.9 }), ['critico']); assert.deepEqual(niveis({ ph: 7.1 }), ['critico']);
assert.deepEqual(niveis({ temperatura_c: 17.9 }), ['critico']);
assert.deepEqual(niveis({ temperatura_c: 31 }), ['atencao']); assert.deepEqual(niveis({ temperatura_c: 25 }), ['atencao']);
assert.deepEqual(avaliarAgua({ oxigenio_mgl: 12 }), [], 'oxigênio alto não é alerta');
assert.deepEqual(avaliarAgua({ oxigenio_mgl: null, temperatura_c: '', ph: undefined }), [], 'campo vazio não vira zero');
assert.deepEqual(niveis({ oxigenio_mgl: '3.50' }), ['critico'], 'banco devolve texto');
assert.deepEqual(niveis({ oxigenio_mgl: 0 }), ['critico'], 'zero é medição válida');
assert.ok(ehTambaqui('Tambaqui') && !ehTambaqui('Tilápia') && !ehTambaqui('Tambacu'));

const base = { resumo: {}, racaoHoje: {}, mediaSemana: {}, mortes: [], hoje: '2026-11-10', cfg: { biometriaDias: 9999, racaoDesvio: 0.5, morteDiasSeguidos: 3 } };
const lotes = [{ id: 'l1', tanque_id: 't1', especie: 'Tambaqui', data_entrada: '2026-10-01' }, { id: 'l2', tanque_id: 't2', especie: 'Tilápia', data_entrada: '2026-10-01' }];
const al = (agua) => alertasManejo({ ...base, lotes, agua }).filter((a) => a.tipo === 'agua');
assert.equal(al([]).length, 0);
assert.equal(al([{ tanque_id: 't1', data: '2026-11-10', hora: '07:00', oxigenio_mgl: 3 }])[0].itens[0].tanque, 't1');
assert.equal(al([{ tanque_id: 't1', data: '2026-11-09', hora: '07:00', oxigenio_mgl: 3 }]).length, 1, 'ontem ainda alerta');
assert.equal(al([{ tanque_id: 't1', data: '2026-11-08', oxigenio_mgl: 3 }]).length, 0, 'medição velha não alerta');
assert.equal(al([{ tanque_id: 't2', data: '2026-11-10', oxigenio_mgl: 3 }]).length, 0, 'sem faixa para a espécie: sem alerta');
assert.equal(al([{ tanque_id: 't1', data: '2026-11-10', temperatura_c: 32 }]).length, 0, 'só o crítico vai para Atenção');
assert.equal(al([{ tanque_id: 't1', data: '2026-11-10', hora: '07:00', oxigenio_mgl: 3 }, { tanque_id: 't1', data: '2026-11-10', hora: '15:00', oxigenio_mgl: 6 }]).length, 0, 'vale a medição mais recente');
assert.equal(al([{ tanque_id: 't1', data: '2026-11-10', hora: '15:00', oxigenio_mgl: 6 }, { tanque_id: 't1', data: '2026-11-10', hora: '07:00', oxigenio_mgl: 3 }]).length, 0, 'a ordem da lista não importa');

console.log('RESULTADO: TUDO OK (água)');
