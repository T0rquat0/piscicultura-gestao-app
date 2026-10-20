// Tambaqui 3D da abertura. Tudo gerado por código (sem arquivo de modelo): corpo, nadadeiras e textura de escamas.
// Gerar o pacote:  cd tools/splash3d && npm i && npx esbuild src.js --bundle --minify --format=esm --outfile=../../js/splash3d.bundle.js
import {
  WebGLRenderer, Scene, PerspectiveCamera, Group, Mesh, BufferGeometry, Float32BufferAttribute, MeshStandardMaterial,
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
  return [NARIZ - COMP * u, 0.06 * r + ALT * r * c * (c < 0 ? 0.92 : 1), LARG * r * Math.sin(phi)];
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
function texCorpo() {
  const W = 1024, H = 512, c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d');
  const gr = x.createLinearGradient(0, 0, 0, H);
  [[0, '#141a0d'], [.08, '#2c3418'], [.18, '#5f6a40'], [.30, '#a9ad8a'], [.40, '#d3a76d'], [.5, '#d9582a']].forEach(([o, col]) => { gr.addColorStop(o, col); gr.addColorStop(1 - o, col); });
  x.fillStyle = gr; x.fillRect(0, 0, W, H);
  // brilho prateado no meio do flanco
  const br = x.createLinearGradient(0, 0, 0, H);
  br.addColorStop(.18, 'rgba(255,255,255,0)'); br.addColorStop(.28, 'rgba(235,240,225,.22)'); br.addColorStop(.38, 'rgba(255,255,255,0)');
  br.addColorStop(.62, 'rgba(255,255,255,0)'); br.addColorStop(.72, 'rgba(235,240,225,.22)'); br.addColorStop(.82, 'rgba(255,255,255,0)');
  x.fillStyle = br; x.fillRect(0, 0, W, H);
  // escamas
  const sw = 17, sh = 15;
  for (let r = 0, y = 0; y < H + sh; r++, y += sh * 0.62) {
    for (let px = (r % 2) * sw / 2 + W * 0.2; px < W; px += sw) {
      const v = y / H, lado = Math.abs(v - 0.5) * 2; // 0 barriga..1 dorso
      x.beginPath(); x.arc(px, y, sh * 0.62, -Math.PI / 2, Math.PI / 2);
      x.strokeStyle = `rgba(0,0,0,${0.10 + 0.08 * (1 - lado)})`; x.lineWidth = 1.2; x.stroke();
      x.beginPath(); x.arc(px - 1.5, y - 1, sh * 0.58, -Math.PI / 2.2, Math.PI / 2.2);
      x.strokeStyle = 'rgba(255,255,255,.10)'; x.lineWidth = 1; x.stroke();
    }
  }
  // cabeça mais lisa e opérculo
  const hg = x.createLinearGradient(0, 0, W * 0.28, 0);
  hg.addColorStop(0, 'rgba(30,30,20,.28)'); hg.addColorStop(1, 'rgba(30,30,20,0)');
  x.fillStyle = hg; x.fillRect(0, 0, W * 0.28, H);
  x.strokeStyle = 'rgba(20,18,10,.32)'; x.lineWidth = 4;
  for (const cy of [H * .24, H * .76]) { x.beginPath(); x.moveTo(W * 0.255, cy - H * .2); x.quadraticCurveTo(W * 0.31, cy, W * 0.255, cy + H * .2); x.stroke(); }
  // ponta do focinho lisa (evita o repuxo da textura na vista de frente) e boca
  const nz = x.createLinearGradient(0, 0, W * 0.1, 0);
  nz.addColorStop(0, 'rgb(104,112,80)'); nz.addColorStop(.55, 'rgb(104,112,80)'); nz.addColorStop(1, 'rgba(104,112,80,0)');
  x.fillStyle = nz; x.fillRect(0, 0, W * 0.1, H);
  x.strokeStyle = 'rgba(25,18,10,.7)'; x.lineWidth = 4; x.lineCap = 'round';
  for (const cy of [H * .36, H * .64]) { x.beginPath(); x.moveTo(W * 0.004, cy - 6); x.quadraticCurveTo(W * 0.05, cy + 10, W * 0.085, cy - 4); x.stroke(); }
  // sardas leves
  for (let i = 0; i < 1400; i++) { x.fillStyle = `rgba(20,20,10,${Math.random() * .09})`; x.fillRect(Math.random() * W, Math.random() * H, 2, 2); }
  const t = new CanvasTexture(c); t.colorSpace = SRGBColorSpace; t.anisotropy = 4; return t;
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
  grupo.add(new Mesh(corpo, mat(texCorpo(), { roughness: 0.5, metalness: 0.1 }))); partes.push(corpo);

  const cauda = grade(14, 14, (u, v) => {
    const s = v * 2 - 1, comp = 0.85 + 0.55 * Math.pow(Math.abs(s), 1.2);
    return [-1.42 - comp * u, 0.05 + s * (0.2 + 0.58 * Math.pow(u, 0.95)), 0];
  });
  grupo.add(new Mesh(cauda, mat(texNadadeira('#3a3a22', '#a8452b', true), { roughness: 0.6 }))); partes.push(cauda);

  const topo = (x) => { const u = (NARIZ - x) / COMP, r = perfil(u); return 0.06 * r + ALT * r - 0.03; };
  const base = (x) => { const u = (NARIZ - x) / COMP, r = perfil(u); return 0.06 * r - ALT * r * 0.92 + 0.03; };
  const dorsal = grade(16, 8, (u, v) => {
    const x = 0.75 - 1.3 * u, h = 0.1 + 0.46 * Math.pow(1 - u, 0.9);
    return [x - v * 0.4 * h, topo(x) + v * h, 0];
  });
  grupo.add(new Mesh(dorsal, mat(texNadadeira('#4a4a28', '#2a2f1c', false), { roughness: 0.6 }))); partes.push(dorsal);

  const anal = grade(14, 8, (u, v) => {
    const x = 0.2 - 0.95 * u, h = 0.08 + 0.46 * Math.pow(1 - u, 0.7);
    return [x - v * 0.35 * h, base(x) - v * h, 0];
  });
  grupo.add(new Mesh(anal, mat(texNadadeira('#c0502c', '#7a2c18', false), { roughness: 0.6 }))); partes.push(anal);

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
    mkFin(0, 0.3, 2.25, 1.0, ['#c9633a', '#8f3a1f'], lado);
    mkFin(0, 0.55, 2.6, 0.62, ['#c0502c', '#7a2c18'], lado);
  }

  // olhos
  for (const lado of [1, -1]) {
    const p = pontoCorpo(0.125, (Math.PI / 2 - 0.45) * lado);
    const o = new Mesh(new SphereGeometry(0.115, 20, 16), new MeshStandardMaterial({ color: 0xf0ead6, roughness: 0.25 }));
    o.position.set(p[0] + 0.02, p[1] + 0.02, p[2] * 0.86); o.scale.set(1, 1, 0.7);
    const pu = new Mesh(new SphereGeometry(0.07, 16, 12), new MeshStandardMaterial({ color: 0x0b0d08, roughness: 0.1 }));
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
  const cena = new Scene(); cena.fog = new Fog(0x0e4f45, 6, 20);
  const aspecto = largura / altura;
  const cam = new PerspectiveCamera(45, aspecto, 0.1, 60); cam.position.set(0, 0.3, 7); cam.lookAt(0, 0, 0);
  cena.add(new HemisphereLight(0xd6f0e8, 0x4d8a7a, 1.5));
  const sol = new DirectionalLight(0xffffff, 2.6); sol.position.set(3, 6, 7); cena.add(sol);
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
