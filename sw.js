// Service worker: deixa o app abrir sem internet.
// Estratégia: rede primeiro (sempre pega a versão nova quando há sinal), com limite de 4 s;
// se a rede falhar ou demorar, usa a cópia guardada. Requisições ao Supabase (outro domínio)
// NÃO passam por aqui: os dados offline ficam no IndexedDB (js/db.js), não neste cache.
const CACHE = 'piscicultura-shell-v1';
const SHELL = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/app.css',
  'vendor/supabase.js',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'js/app.js', 'js/config.js', 'js/util.js', 'js/calc.js', 'js/db.js', 'js/sync.js', 'js/api.js',
  'js/views/login.js', 'js/views/home.js', 'js/views/lancar.js', 'js/views/tanques.js',
  'js/views/estoque.js', 'js/views/relatorio.js', 'js/views/equipe.js', 'js/views/pendencias.js', 'js/views/mais.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  if (new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(redePrimeiro(req));
});

async function redePrimeiro(req) {
  const cache = await caches.open(CACHE);
  try {
    const resp = await Promise.race([
      fetch(req),
      new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 4000)),
    ]);
    if (resp && resp.ok) cache.put(req, resp.clone());
    return resp;
  } catch (err) {
    const guardado = (await cache.match(req, { ignoreSearch: true })) || (req.mode === 'navigate' ? await cache.match('index.html') : null);
    if (guardado) return guardado;
    throw err;
  }
}
