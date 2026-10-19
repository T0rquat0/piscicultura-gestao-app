// Armazenamento local (IndexedDB): fila de lançamentos offline + cache de dados de referência.
// A fila NUNCA é apagada por logout nem por atualização do app: só quando o servidor confirma
// o envio ou quando o usuário descarta o item manualmente.

const NOME = 'piscicultura';
const VERSAO = 1;
let _db = null;
let _seq = 0;

function abrir() {
  if (_db) return Promise.resolve(_db);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(NOME, VERSAO);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('fila')) db.createObjectStore('fila', { keyPath: 'uuid_local' });
      if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv', { keyPath: 'chave' });
    };
    req.onsuccess = () => {
      _db = req.result;
      _db.onversionchange = () => { _db.close(); _db = null; };
      resolve(_db);
    };
    req.onerror = () => reject(req.error);
  });
}

function pedido(store, modo, fn) {
  return abrir().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(store, modo);
        let resultado;
        const r = fn(tx.objectStore(store));
        if (r) r.onsuccess = () => { resultado = r.result; };
        tx.oncomplete = () => resolve(resultado);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      })
  );
}

// item: {uuid_local, tabela, payload, registrado_por, criado_em, status, erro, tentativas}
export const filaAdd = (item) =>
  pedido('fila', 'readwrite', (s) => s.add({ ...item, seq: Date.now() * 1000 + (_seq++ % 1000) }));
export const filaList = async () =>
  ((await pedido('fila', 'readonly', (s) => s.getAll())) || []).sort((a, b) => a.seq - b.seq);
export const filaPut = (item) => pedido('fila', 'readwrite', (s) => s.put(item));
export const filaRemove = (uuidLocal) => pedido('fila', 'readwrite', (s) => s.delete(uuidLocal));

export async function kvGet(chave) {
  const r = await pedido('kv', 'readonly', (s) => s.get(chave));
  return r ? r.valor : undefined;
}
export const kvSet = (chave, valor) => pedido('kv', 'readwrite', (s) => s.put({ chave, valor }));
export const kvDel = (chave) => pedido('kv', 'readwrite', (s) => s.delete(chave));
