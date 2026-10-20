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
// Escamas em mosaico: devolve a cor e um mapa de relevo/brilho gerados juntos.
function texCorpo() {
  const W = 2048, H = 1024;
  const mk = () => { const c = document.createElement('canvas'); c.width = W; c.height = H; return c; };
  const cc = mk(), cb = mk(), x = cc.getContext('2d'), xb = cb.getContext('2d');
  // base: dorso verde-escuro -> flanco prateado -> barriga clara com tom rosado/alaranjado
  const gr = x.createLinearGradient(0, 0, 0, H);
  [[0, '#0d110a'], [.09, '#1b2113'], [.19, '#363a20'], [.27, '#6f6535'], [.35, '#b08a40'], [.43, '#d28235'], [.5, '#d8602c']]
    .forEach(([o, col]) => { gr.addColorStop(o, col); gr.addColorStop(1 - o, col); });
  x.fillStyle = gr; x.fillRect(0, 0, W, H);
  xb.fillStyle = '#808080'; xb.fillRect(0, 0, W, H);
  // cada escama: leque com brilho próprio (varia de uma para outra) e borda em relevo
  const sw = 30, sh = 24;
  let semente = 7; const rnd = () => (semente = (semente * 16807) % 2147483647) / 2147483647;
  for (let r = 0, y = sh * 0.3; y < H + sh; r++, y += sh * 0.55) {
    for (let px = (r % 2) * sw / 2 + W * 0.2; px < W + sw; px += sw) {
      const v = y / H, ventre = 1 - Math.abs(v - 0.5) * 2;   // 0 dorso .. 1 barriga
      const tam = sh * 0.82, br = 0.5 + rnd() * 0.5;
      // brilho da escama
      const g = x.createRadialGradient(px - sw * 0.15, y - sh * 0.1, 1, px, y, tam);
      g.addColorStop(0, `rgba(255,238,200,${0.26 * br})`); g.addColorStop(0.6, 'rgba(255,255,255,0.02)'); g.addColorStop(1, `rgba(0,0,0,${0.16 + 0.10 * (1 - ventre)})`);
      x.beginPath(); x.arc(px, y, tam, -Math.PI / 2.1, Math.PI / 2.1); x.lineTo(px - sw * 0.5, y + sh * 0.1); x.lineTo(px - sw * 0.5, y - sh * 0.1); x.closePath();
      x.fillStyle = g; x.fill();
      // reflexo esverdeado/rosado de cada escama
      x.fillStyle = rnd() < 0.5 ? `rgba(190,200,120,${0.07 * br})` : `rgba(240,150,110,${0.06 * br})`; x.fill();
      // borda da escama (contorno livre voltado para o rabo)
      x.beginPath(); x.arc(px, y, tam, -Math.PI / 2.1, Math.PI / 2.1);
      x.strokeStyle = 'rgba(15,30,20,0.35)'; x.lineWidth = 1.6; x.stroke();
      // relevo: escama levemente abaulada
      const gb = xb.createRadialGradient(px - sw * 0.2, y, 1, px, y, tam);
      gb.addColorStop(0, '#9a9a9a'); gb.addColorStop(0.75, '#7c7c7c'); gb.addColorStop(1, '#4a4a4a');
      xb.beginPath(); xb.arc(px, y, tam, -Math.PI / 2.1, Math.PI / 2.1); xb.lineTo(px - sw * 0.5, y + sh * 0.1); xb.lineTo(px - sw * 0.5, y - sh * 0.1); xb.closePath();
      xb.fillStyle = gb; xb.fill();
    }
  }
  // linha lateral
  for (const cy of [H * 0.27, H * 0.73]) {
    x.strokeStyle = 'rgba(30,45,30,0.14)'; x.lineWidth = 3; x.beginPath(); x.moveTo(W * 0.27, cy); x.bezierCurveTo(W * 0.5, cy - 8, W * 0.75, cy + 6, W * 0.97, cy); x.stroke();
  }
  // faixa prateada brilhante no meio do flanco
  const br = x.createLinearGradient(0, 0, 0, H);
  [[.2, 0], [.285, .17], [.37, 0]].forEach(([o, a]) => { br.addColorStop(o, `rgba(255,240,205,${a})`); br.addColorStop(1 - o, `rgba(255,240,205,${a})`); });
  x.fillStyle = br; x.fillRect(W * 0.2, 0, W * 0.8, H);
  // cabeça lisa, mais escura em cima, com opérculo
  const hg = x.createLinearGradient(0, 0, W * 0.27, 0);
  hg.addColorStop(0, 'rgba(120,135,115,1)'); hg.addColorStop(0.5, 'rgba(120,135,115,0.85)'); hg.addColorStop(1, 'rgba(120,135,115,0)');
  const hv = x.createLinearGradient(0, 0, 0, H);
  hv.addColorStop(0, '#12170d'); hv.addColorStop(.2, '#3b3d22'); hv.addColorStop(.38, '#8a7340'); hv.addColorStop(.5, '#c9733a'); hv.addColorStop(.62, '#8a7340'); hv.addColorStop(.8, '#3b3d22'); hv.addColorStop(1, '#12170d');
  // cabeça com borda suave (sem corte seco onde começam as escamas)
  const mascara = (ctxDest, desenha) => {
    const t = document.createElement('canvas'); t.width = W; t.height = H; const tx = t.getContext('2d');
    desenha(tx);
    tx.globalCompositeOperation = 'destination-in';
    const m = tx.createLinearGradient(W * 0.2, 0, W * 0.31, 0); m.addColorStop(0, 'rgba(0,0,0,1)'); m.addColorStop(1, 'rgba(0,0,0,0)');
    tx.fillStyle = m; tx.fillRect(0, 0, W, H);
    ctxDest.drawImage(t, 0, 0);
  };
  mascara(x, (tx) => { tx.fillStyle = hv; tx.fillRect(0, 0, W * 0.32, H); });
  mascara(xb, (tx) => { tx.fillStyle = '#808080'; tx.fillRect(0, 0, W * 0.32, H); });
  const fade = x.createLinearGradient(W * 0.22, 0, W * 0.29, 0); fade.addColorStop(0, 'rgba(0,0,0,0)'); fade.addColorStop(1, 'rgba(0,0,0,0)');
  x.strokeStyle = 'rgba(20,35,25,.45)'; x.lineWidth = 7; x.lineCap = 'round';
  for (const cy of [H * .24, H * .76]) { x.beginPath(); x.moveTo(W * 0.255, cy - H * .21); x.quadraticCurveTo(W * 0.315, cy, W * 0.255, cy + H * .21); x.stroke(); }
  // brilho do opérculo
  for (const cy of [H * .3, H * .7]) { const o = x.createRadialGradient(W * 0.18, cy, 2, W * 0.18, cy, W * 0.07); o.addColorStop(0, 'rgba(255,255,255,.28)'); o.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = o; x.fillRect(W * 0.08, cy - W * .08, W * .2, W * .16); }
  // focinho liso e boca
  const nz = x.createLinearGradient(0, 0, W * 0.1, 0);
  nz.addColorStop(0, 'rgb(62,58,34)'); nz.addColorStop(.5, 'rgb(62,58,34)'); nz.addColorStop(1, 'rgba(62,58,34,0)');
  x.fillStyle = nz; x.fillRect(0, 0, W * 0.1, H);
  x.strokeStyle = 'rgba(25,18,10,.75)'; x.lineWidth = 6; x.lineCap = 'round';
  for (const cy of [H * .36, H * .64]) { x.beginPath(); x.moveTo(W * 0.004, cy - 10); x.quadraticCurveTo(W * 0.05, cy + 14, W * 0.085, cy - 6); x.stroke(); }
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
  grupo.add(new Mesh(corpo, new MeshPhysicalMaterial({ map: tc.cor, bumpMap: tc.rel, bumpScale: 2.2, roughness: 0.32, metalness: 0.28, clearcoat: 0.4, clearcoatRoughness: 0.35, envMapIntensity: 0.8, side: DoubleSide }))); partes.push(corpo);

  const cauda = grade(14, 14, (u, v) => {
    const s = v * 2 - 1, comp = 0.85 + 0.55 * Math.pow(Math.abs(s), 1.2);
    return [-1.42 - comp * u, 0.05 + s * (0.2 + 0.58 * Math.pow(u, 0.95)), 0];
  });
  grupo.add(new Mesh(cauda, mat(texNadadeira('#2a2820', '#74392c', true), { roughness: 0.6 }))); partes.push(cauda);

  const topo = (x) => { const u = (NARIZ - x) / COMP, r = perfil(u); return 0.06 * r + ALT * r - 0.03; };
  const base = (x) => { const u = (NARIZ - x) / COMP, r = perfil(u); return 0.06 * r - ALT * r * 0.92 + 0.03; };
  const dorsal = grade(16, 8, (u, v) => {
    const x = 0.75 - 1.3 * u, h = 0.1 + 0.46 * Math.pow(1 - u, 0.9);
    return [x - v * 0.4 * h, topo(x) + v * h, 0];
  });
  grupo.add(new Mesh(dorsal, mat(texNadadeira('#3a3a24', '#14180e', false), { roughness: 0.6 }))); partes.push(dorsal);

  const anal = grade(14, 8, (u, v) => {
    const x = 0.2 - 0.95 * u, h = 0.08 + 0.46 * Math.pow(1 - u, 0.7);
    return [x - v * 0.35 * h, base(x) - v * h, 0];
  });
  grupo.add(new Mesh(anal, mat(texNadadeira('#dc6a3a', '#8e2e1c', false), { roughness: 0.6 }))); partes.push(anal);

  const adiposa = grade(8, 6, (u, v) => { const x = -0.78 - 0.34 * u, h = 0.05 + 0.2 * Math.sin(Math.PI * Math.min(1, u * 0.9 + 0.1)); return [x - v * 0.12, topo(x) + v * h, 0]; });
  grupo.add(new Mesh(adiposa, mat(texNadadeira('#2f3220', '#14180e', false), { roughness: 0.6 }))); partes.push(adiposa);

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
    mkFin(0, 0.3, 2.25, 1.0, ['#c97a45', '#7a2e1c'], lado);
    mkFin(0, 0.55, 2.6, 0.62, ['#d8683a', '#8e2e1c'], lado);
  }

  // olhos
  for (const lado of [1, -1]) {
    const p = pontoCorpo(0.125, (Math.PI / 2 - 0.45) * lado);
    const o = new Mesh(new SphereGeometry(0.115, 20, 16), new MeshStandardMaterial({ color: 0xc9923a, roughness: 0.25, metalness: 0.4 }));
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
