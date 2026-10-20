// Tambaqui 3D da abertura. Tudo gerado por código (sem arquivo de modelo): corpo, nadadeiras e textura de escamas.
// Gerar o pacote:  cd tools/splash3d && npm i && npx esbuild src.js --bundle --minify --format=esm --outfile=../../js/splash3d.bundle.js
import {
  WebGLRenderer, Scene, PerspectiveCamera, Group, Mesh, BufferGeometry, Float32BufferAttribute, MeshStandardMaterial, MeshPhysicalMaterial, PMREMGenerator, BackSide, MeshBasicMaterial, PlaneGeometry,
  CanvasTexture, DoubleSide, HemisphereLight, DirectionalLight, SphereGeometry, Fog, SRGBColorSpace, Vector3,
} from 'three';

const NARIZ = 1.9, COMP = 3.4, ALT = 0.98, LARG = 0.44;
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const easeIO = (x) => (x < 0 ? 0 : x > 1 ? 1 : x * x * (3 - 2 * x));

// perfil do corpo: 0 no focinho, cresce até ~1/3, afina até o pedúnculo
function perfil(u) {
  const core = Math.sqrt(u) * (1 - u) / 0.385;
  return (core + 0.12 * smooth(0.45, 1, u)) * (1 - smooth(0.98, 1, u));
}
function pontoCorpo(u, phi) {
  const r = perfil(u), c = Math.cos(phi);
  const corcunda = c > 0 ? 1 + 0.1 * smooth(0.12, 0.3, u) * (1 - smooth(0.45, 0.85, u)) : 0.92;   // dorso alto logo atrás da cabeça
  const queixo = c < 0 ? 0.16 * (-c) * smooth(0.13, 0, u) : 0;                                      // mandíbula inferior mais à frente
  return [NARIZ - COMP * u + queixo, 0.06 * r + ALT * r * c * corcunda, LARG * r * Math.sin(phi)];
}

// malha paramétrica (nu × nv) com função fn(u,v) -> [x,y,z]
function grade(nu, nv, fn, fechadoEmV = false) {
  const pos = [], uv = [], idx = [];
  for (let i = 0; i <= nu; i++) for (let j = 0; j <= nv; j++) { const p = fn(i / nu, j / nv); pos.push(...p); uv.push(i / nu, j / nv); }
  for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) { const a = i * (nv + 1) + j, b = a + 1, c = a + nv + 1, d = c + 1; idx.push(a, b, c, b, d, c); }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.userData.base = Float32Array.from(pos);
  g.userData.nu = nu; g.userData.nv = nv; g.userData.fechado = fechadoEmV;
  return g;
}
function normais(g) {
  g.computeVertexNormals();
  if (!g.userData.fechado) return;
  const n = g.attributes.normal, { nu, nv } = g.userData;
  for (let i = 0; i <= nu; i++) {
    const a = i * (nv + 1), b = a + nv;
    for (const k of [0, 1, 2]) { const m = (n.array[a * 3 + k] + n.array[b * 3 + k]) / 2; n.array[a * 3 + k] = m; n.array[b * 3 + k] = m; }
  }
  n.needsUpdate = true;
}

// ---------- texturas ----------
// Pele de tambaqui: cinza-chumbo quase preto, escamas finas e foscas, barriga amarelo-alaranjada, lábios claros.
function texCorpo() {
  const W = 2048, H = 1024;
  const mk = () => { const c = document.createElement('canvas'); c.width = W; c.height = H; return c; };
  const cc = mk(), cb = mk(), x = cc.getContext('2d'), xb = cb.getContext('2d');
  let semente = 11; const rnd = () => (semente = (semente * 16807) % 2147483647) / 2147483647;
  const gr = x.createLinearGradient(0, 0, 0, H);
  [[0, '#101215'], [.12, '#1b1f22'], [.24, '#2f3433'], [.33, '#4a4838'], [.39, '#6d6039'], [.43, '#ad8a35'], [.47, '#d9862c'], [.5, '#d9672a']]
    .forEach(([o, col]) => { gr.addColorStop(o, col); gr.addColorStop(1 - o, col); });
  x.fillStyle = gr; x.fillRect(0, 0, W, H);
  xb.fillStyle = '#808080'; xb.fillRect(0, 0, W, H);
  // manchas largas de tom (a pele real não é uniforme)
  for (let i = 0; i < 160; i++) {
    const px = rnd() * W, py = rnd() * H * 0.75 + H * 0.12, r = 40 + rnd() * 120;
    const g = x.createRadialGradient(px, py, 1, px, py, r); const clara = rnd() < 0.5;
    g.addColorStop(0, clara ? 'rgba(120,118,100,0.10)' : 'rgba(0,0,0,0.12)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = g; x.fillRect(px - r, py - r, 2 * r, 2 * r);
  }
  // escamas pequenas, uniformes, com relevo suave
  const sw = 19, sh = 15;
  for (let r = 0, y = sh * 0.3; y < H + sh; r++, y += sh * 0.55) {
    for (let px = (r % 2) * sw / 2 + W * 0.2; px < W + sw; px += sw) {
      const v = y / H, dorso = Math.abs(v - 0.5) * 2, tam = sh * 0.85, br = 0.4 + rnd() * 0.6;
      const g = x.createRadialGradient(px - sw * 0.2, y - sh * 0.1, 1, px, y, tam);
      g.addColorStop(0, `rgba(225,215,190,${0.12 * br})`); g.addColorStop(0.65, 'rgba(255,255,255,0)'); g.addColorStop(1, `rgba(0,0,0,${0.22 + 0.08 * dorso})`);
      x.beginPath(); x.arc(px, y, tam, -Math.PI / 2.1, Math.PI / 2.1); x.lineTo(px - sw * 0.5, y + sh * 0.1); x.lineTo(px - sw * 0.5, y - sh * 0.1); x.closePath();
      x.fillStyle = g; x.fill();
      x.beginPath(); x.arc(px, y, tam, -Math.PI / 2.1, Math.PI / 2.1); x.strokeStyle = 'rgba(0,0,0,0.42)'; x.lineWidth = 1.4; x.stroke();
      const gb = xb.createRadialGradient(px - sw * 0.2, y, 1, px, y, tam);
      gb.addColorStop(0, '#979797'); gb.addColorStop(0.75, '#7f7f7f'); gb.addColorStop(1, '#4f4f4f');
      xb.beginPath(); xb.arc(px, y, tam, -Math.PI / 2.1, Math.PI / 2.1); xb.lineTo(px - sw * 0.5, y + sh * 0.1); xb.lineTo(px - sw * 0.5, y - sh * 0.1); xb.closePath();
      xb.fillStyle = gb; xb.fill();
    }
  }
  // brilho tênue de umidade no alto do flanco
  const br = x.createLinearGradient(0, 0, 0, H);
  [[.14, 0], [.24, .07], [.33, 0]].forEach(([o, a]) => { br.addColorStop(o, `rgba(200,210,205,${a})`); br.addColorStop(1 - o, `rgba(200,210,205,${a})`); });
  x.fillStyle = br; x.fillRect(W * 0.22, 0, W * 0.78, H);
  // cabeça: pele lisa, mais escura em cima, queixo e garganta amarelo-alaranjados
  const hv = x.createLinearGradient(0, 0, 0, H);
  [[0, '#14171a'], [.2, '#2a2f31'], [.34, '#4a4a3f'], [.41, '#7d6a3a'], [.45, '#c79a36'], [.5, '#e0782c']].forEach(([o, col]) => { hv.addColorStop(o, col); hv.addColorStop(1 - o, col); });
  const mascara = (ctxDest, desenha) => {
    const t = document.createElement('canvas'); t.width = W; t.height = H; const tx = t.getContext('2d');
    desenha(tx); tx.globalCompositeOperation = 'destination-in';
    const m = tx.createLinearGradient(W * 0.2, 0, W * 0.31, 0); m.addColorStop(0, 'rgba(0,0,0,1)'); m.addColorStop(1, 'rgba(0,0,0,0)');
    tx.fillStyle = m; tx.fillRect(0, 0, W, H); ctxDest.drawImage(t, 0, 0);
  };
  mascara(x, (tx) => { tx.fillStyle = hv; tx.fillRect(0, 0, W * 0.32, H); });
  mascara(xb, (tx) => { tx.fillStyle = '#808080'; tx.fillRect(0, 0, W * 0.32, H); });
  // opérculo (borda da guelra) e pequeno brilho
  x.strokeStyle = 'rgba(8,10,10,.22)'; x.lineWidth = 6; x.lineCap = 'round';
  for (const cy of [H * .24, H * .76]) { x.beginPath(); x.moveTo(W * 0.255, cy - H * .22); x.quadraticCurveTo(W * 0.32, cy, W * 0.255, cy + H * .22); x.stroke(); }
  // focinho liso, lábios claros e boca com sombra
  const nz = x.createLinearGradient(0, 0, W * 0.1, 0);
  nz.addColorStop(0, 'rgb(40,42,40)'); nz.addColorStop(.5, 'rgb(40,42,40)'); nz.addColorStop(1, 'rgba(40,42,40,0)');
  x.fillStyle = nz; x.fillRect(0, 0, W * 0.1, H * 0.62); x.fillRect(0, H * 0.38, W * 0.1, H * 0.62);
  for (const cy of [H * .37, H * .63]) {
    x.strokeStyle = 'rgba(205,170,110,.75)'; x.lineWidth = 12; x.lineCap = 'round';
    x.beginPath(); x.moveTo(W * 0.004, cy - 12); x.quadraticCurveTo(W * 0.05, cy + 16, W * 0.09, cy - 6); x.stroke();
    x.strokeStyle = 'rgba(10,6,4,.85)'; x.lineWidth = 4;
    x.beginPath(); x.moveTo(W * 0.006, cy - 12); x.quadraticCurveTo(W * 0.05, cy + 14, W * 0.088, cy - 6); x.stroke();
  }
  const cor = new CanvasTexture(cc); cor.colorSpace = SRGBColorSpace; cor.anisotropy = 8;
  const rel = new CanvasTexture(cb); rel.anisotropy = 4;
  return { cor, rel };
}
function texNadadeira(cor1, cor2, raiosEmU) {
  const S = 256, c = document.createElement('canvas'); c.width = S; c.height = S;
  const x = c.getContext('2d');
  const gr = raiosEmU ? x.createLinearGradient(0, 0, S, 0) : x.createLinearGradient(0, 0, 0, S);
  gr.addColorStop(0, cor1); gr.addColorStop(1, cor2);
  x.fillStyle = gr; x.fillRect(0, 0, S, S);
  x.strokeStyle = 'rgba(0,0,0,.22)'; x.lineWidth = 1.4;
  for (let i = 0; i <= 28; i++) { const p = (i / 28) * S; x.beginPath(); if (raiosEmU) { x.moveTo(0, p); x.lineTo(S, p); } else { x.moveTo(p, 0); x.lineTo(p, S); } x.stroke(); }
  x.strokeStyle = 'rgba(255,255,255,.08)';
  for (let i = 0; i <= 28; i++) { const p = ((i + .5) / 28) * S; x.beginPath(); if (raiosEmU) { x.moveTo(0, p); x.lineTo(S, p); } else { x.moveTo(p, 0); x.lineTo(p, S); } x.stroke(); }
  const t = new CanvasTexture(c); t.colorSpace = SRGBColorSpace; return t;
}

// ---------- peixe ----------
function montarPeixe() {
  const grupo = new Group();
  const partes = []; // geometrias que ondulam com o corpo
  const mat = (map, extra = {}) => new MeshStandardMaterial({ map, roughness: 0.4, metalness: 0.12, side: DoubleSide, ...extra });

  const corpo = grade(64, 40, (u, v) => pontoCorpo(u, v * Math.PI * 2), true);
  const tc = texCorpo();
  grupo.add(new Mesh(corpo, new MeshPhysicalMaterial({ map: tc.cor, bumpMap: tc.rel, bumpScale: 1.3, roughness: 0.52, metalness: 0.08, clearcoat: 0.18, clearcoatRoughness: 0.5, envMapIntensity: 0.45, side: DoubleSide }))); partes.push(corpo);

  const cauda = grade(14, 14, (u, v) => {
    const s = v * 2 - 1, comp = 0.85 + 0.55 * Math.pow(Math.abs(s), 1.2);
    return [-1.42 - comp * u, 0.05 + s * (0.2 + 0.58 * Math.pow(u, 0.95)), 0];
  });
  grupo.add(new Mesh(cauda, mat(texNadadeira('#6d6e68', '#1a1b1c', true), { roughness: 0.6 }))); partes.push(cauda);

  const topo = (x) => { const u = (NARIZ - x) / COMP, r = perfil(u); return 0.06 * r + ALT * r - 0.03; };
  const base = (x) => { const u = (NARIZ - x) / COMP, r = perfil(u); return 0.06 * r - ALT * r * 0.92 + 0.03; };
  const dorsal = grade(16, 8, (u, v) => {
    const x = 0.62 - 1.05 * u, h = 0.08 + 0.55 * Math.pow(1 - u, 1.1);
    return [x - v * 0.4 * h, topo(x) + v * h, 0];
  });
  grupo.add(new Mesh(dorsal, mat(texNadadeira('#2c2f30', '#101213', false), { roughness: 0.6 }))); partes.push(dorsal);

  const anal = grade(14, 8, (u, v) => {
    const x = 0.3 - 1.25 * u, h = 0.1 + 0.55 * Math.pow(1 - u, 0.8);
    return [x - v * 0.35 * h, base(x) - v * h, 0];
  });
  grupo.add(new Mesh(anal, mat(texNadadeira('#e2782c', '#a8381a', false), { roughness: 0.6 }))); partes.push(anal);

  const adiposa = grade(8, 6, (u, v) => { const x = -0.78 - 0.34 * u, h = 0.05 + 0.2 * Math.sin(Math.PI * Math.min(1, u * 0.9 + 0.1)); return [x - v * 0.12, topo(x) + v * h, 0]; });
  grupo.add(new Mesh(adiposa, mat(texNadadeira('#26292a', '#0f1112', false), { roughness: 0.6 }))); partes.push(adiposa);

  // peitorais e pélvicas (batem sozinhas)
  const nadadeiras = [];
  const mkFin = (cx, u0, phi, tam, cor, lado) => {
    const g = grade(8, 8, (u, v) => { const w = 1 - 0.75 * v * v; return [(-u * 0.4 * w - v * 0.32) * tam, -v * (0.5 + 0.1 * Math.sin(Math.PI * u)) * tam, 0]; });
    const m = new Mesh(g, mat(texNadadeira(cor[0], cor[1], false), { roughness: 0.6 }));
    const p = pontoCorpo(u0, phi * lado);
    g.computeVertexNormals();
    m.position.set(p[0], p[1], p[2]); m.userData = { lado, ox: p[0], tam };
    grupo.add(m); nadadeiras.push(m);
  };
  for (const lado of [1, -1]) {
    mkFin(0, 0.3, 2.25, 1.0, ['#2c2f30', '#141617'], lado);
    mkFin(0, 0.55, 2.6, 0.62, ['#e07a2e', '#a8381a'], lado);
  }

  // olhos
  for (const lado of [1, -1]) {
    const p = pontoCorpo(0.125, (Math.PI / 2 - 0.45) * lado);
    const o = new Mesh(new SphereGeometry(0.1, 20, 16), new MeshStandardMaterial({ color: 0x6a2a1c, roughness: 0.3, metalness: 0.2 }));
    o.position.set(p[0] + 0.02, p[1] + 0.02, p[2] * 0.86); o.scale.set(1, 1, 0.7);
    const pu = new Mesh(new SphereGeometry(0.066, 16, 12), new MeshStandardMaterial({ color: 0x0b0d08, roughness: 0.1 }));
    pu.position.set(0.03, 0.0, 0.06 * lado); o.add(pu);
    grupo.add(o);
  }
  return { grupo, partes, nadadeiras };
}

// ondulação: o corpo todo vira uma onda que vai do focinho ao rabo
function dobra(x, t) {
  const q = clamp((NARIZ - x) / 4.6, 0, 1.05);
  return (0.04 + 0.56 * q * q) * Math.sin(t * 13 - 3.4 * q);
}

export function criar(canvas, { largura, altura, dpr = 1, lado = 1 }) {
  const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'low-power' });
  renderer.setPixelRatio(Math.min(dpr, 1.75)); renderer.setSize(largura, altura, false);
  renderer.setClearColor(0x000000, 0);
  const cena = new Scene(); cena.fog = new Fog(0x1d7565, 6, 20);
  const aspecto = largura / altura;
  const cam = new PerspectiveCamera(45, aspecto, 0.1, 60); cam.position.set(0, 0.3, 7); cam.lookAt(0, 0, 0);
  // ambiente de reflexo (sem arquivo): cúpula de gradiente com painéis claros
  const amb = new Scene();
  const cv = document.createElement('canvas'); cv.width = 4; cv.height = 256; const cx = cv.getContext('2d');
  const gg = cx.createLinearGradient(0, 0, 0, 256); gg.addColorStop(0, '#fbfdfb'); gg.addColorStop(.45, '#d3dfd8'); gg.addColorStop(.55, '#8faea3', ); gg.addColorStop(1, '#1d4a42');
  cx.fillStyle = gg; cx.fillRect(0, 0, 4, 256);
  const tg = new CanvasTexture(cv); tg.colorSpace = SRGBColorSpace;
  amb.add(new Mesh(new SphereGeometry(20, 32, 16), new MeshBasicMaterial({ map: tg, side: BackSide })));
  for (const [px, py, pz, w] of [[6, 8, 6, 9], [-8, 5, 3, 6], [2, 9, -9, 7]]) { const pl = new Mesh(new PlaneGeometry(w, w * 0.6), new MeshBasicMaterial({ color: 0xffffff, side: DoubleSide })); pl.position.set(px, py, pz); pl.lookAt(0, 0, 0); amb.add(pl); }
  const pm = new PMREMGenerator(renderer); cena.environment = pm.fromScene(amb, 0.04).texture; pm.dispose();
  cena.add(new HemisphereLight(0xd6f0e8, 0x4d8a7a, 0.7));
  const sol = new DirectionalLight(0xffffff, 2.0); sol.position.set(3, 6, 7); cena.add(sol);
  const contra = new DirectionalLight(0x7fe0cb, 0.7); contra.position.set(-5, 1, -4); cena.add(contra);

  const { grupo, partes, nadadeiras } = montarPeixe();
  const raiz = new Group(); const giro = new Group(); // raiz: posição e rumo; giro: inclinação do corpo
  giro.add(grupo); raiz.add(giro); cena.add(raiz);
  const escala = clamp(1.2 * aspecto, 0.52, 1); raiz.scale.setScalar(escala);

  const T_VIRA = 1.45, D_VIRA = 1.5, TOTAL = 3.7;
  const est = { t: 0, pos: new Vector3(-lado * 0.8, -0.5, -12.6), theta: -Math.PI / 2 };
  const alvo = lado > 0 ? 0 : -Math.PI;

  function pose(dt) {
    const t = est.t;
    const vira = easeIO((t - T_VIRA) / D_VIRA);
    est.theta = -Math.PI / 2 + (alvo + Math.PI / 2) * vira;
    const vel = t < T_VIRA ? 14 - 8.5 * (1 - Math.pow(1 - t / T_VIRA, 2)) : 5.5 - 2.0 * vira + 3.5 * clamp((t - T_VIRA - D_VIRA) / 0.9, 0, 1);
    est.pos.x += Math.cos(est.theta) * vel * dt; est.pos.z += -Math.sin(est.theta) * vel * dt;
    est.pos.y += (0.05 - est.pos.y) * Math.min(1, dt * 1.6);
    raiz.position.copy(est.pos); raiz.rotation.set(0, est.theta, 0);
    giro.rotation.set(-lado * 0.5 * Math.sin(Math.PI * clamp((t - T_VIRA) / D_VIRA, 0, 1)), 0, 0.05);
  }
  function ondular() {
    const t = est.t;
    for (const g of partes) {
      const p = g.attributes.position, b = g.userData.base;
      for (let i = 0; i < p.count; i++) p.array[i * 3 + 2] = b[i * 3 + 2] + dobra(b[i * 3], t);
      p.needsUpdate = true; normais(g);
    }
    nadadeiras.forEach((n, i) => {
      const { lado: s, tam } = n.userData;
      n.rotation.x = s * (-(0.75 + 0.2 * Math.sin(t * 7 + i)));
      n.position.z = n.position.z * 0 + (n.userData.zz ?? (n.userData.zz = n.position.z)) + dobra(n.userData.ox, t);
    });
  }
  return {
    raiz, giro, est, pose, ondular,
    get t() { return est.t; }, TOTAL,
    passo(dt) { est.t += dt; pose(dt); ondular(); },
    desenhar() { renderer.render(cena, cam); },
    fade() { return 1 - easeIO((est.t - (TOTAL - 0.9)) / 0.7); },
    fim() { return est.t >= TOTAL; },
    destruir() { renderer.dispose(); cena.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) { o.material.map && o.material.map.dispose(); o.material.dispose(); } }); },
  };
}
