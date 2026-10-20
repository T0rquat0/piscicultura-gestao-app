// Tambaqui 3D da abertura. O modelo (malha leve + texturas) vem de assets/peixe/; o rabo e o corpo
// ondulam por código (o modelo não tem esqueleto). O ambiente de reflexo é gerado, sem arquivo.
// Gerar o pacote:  cd tools/splash3d && npm i && npx esbuild src.js --bundle --minify --format=esm --outfile=../../js/splash3d.bundle.js
import {
  WebGLRenderer, Scene, PerspectiveCamera, Group, Mesh, BufferGeometry, BufferAttribute, MeshStandardMaterial,
  CanvasTexture, Texture, DoubleSide, HemisphereLight, DirectionalLight, SphereGeometry, Fog, SRGBColorSpace,
  NoColorSpace, ObjectSpaceNormalMap, Vector3, PMREMGenerator, BackSide, MeshBasicMaterial, PlaneGeometry,
} from 'three';

const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const easeIO = (x) => (x < 0 ? 0 : x > 1 ? 1 : x * x * (3 - 2 * x));

const ESCALA = 4.3;      // modelo normalizado: 1,0 de comprimento, centrado na origem

// ---------- carga do modelo ----------
function imagem(url) {
  return new Promise((ok, erro) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => erro(new Error('img ' + url)); i.src = url; });
}
export async function carregar(base) {
  const [bin, cor, normal] = await Promise.all([
    fetch(base + 'peixe.bin').then((r) => { if (!r.ok) throw new Error('bin'); return r.arrayBuffer(); }),
    imagem(base + 'cor.jpg'), imagem(base + 'normal.jpg'),
  ]);
  const [N, I, tamIdx] = new Uint32Array(bin, 0, 3);   // cabeçalho: vértices, índices, bytes por índice
  const pos = new Float32Array(bin, 16, N * 3), nor = new Float32Array(bin, 16 + N * 12, N * 3), uv = new Float32Array(bin, 16 + N * 24, N * 2);
  const idx = tamIdx === 2 ? new Uint16Array(bin, 16 + N * 32, I) : new Uint32Array(bin, 16 + N * 32, I);
  return { pos, nor, uv, idx, cor, normal };
}
const tex = (img, srgb) => { const t = new Texture(img); t.flipY = false; t.colorSpace = srgb ? SRGBColorSpace : NoColorSpace; t.anisotropy = 4; t.needsUpdate = true; return t; };

function montarPeixe(d) {
  const g = new BufferGeometry();
  const pos = Float32Array.from(d.pos);
  g.setAttribute('position', new BufferAttribute(pos, 3));
  g.setAttribute('normal', new BufferAttribute(Float32Array.from(d.nor), 3));
  g.setAttribute('uv', new BufferAttribute(d.uv, 2));
  g.setIndex(new BufferAttribute(d.idx, 1));
  const mat = new MeshStandardMaterial({ map: tex(d.cor, true), normalMap: tex(d.normal, false), normalMapType: ObjectSpaceNormalMap, roughness: 0.5, metalness: 0.05, envMapIntensity: 0.7, side: DoubleSide });
  const malha = new Mesh(g, mat);
  // modelo: cabeça em -x, rabo em +x, base em y=0. Giramos para a cabeça ficar em +x e centramos na altura.
  malha.position.set(0, 0, 0);
  const miolo = new Group(); miolo.add(malha); miolo.scale.set(-ESCALA, ESCALA, ESCALA); // espelho em x: cabeça passa a +x
  malha.scale.set(1, 1, 1);
  const grupo = new Group(); grupo.add(miolo);
  return { grupo, geo: g, base: Float32Array.from(d.pos), miolo };
}

// ondulação: o corpo todo vira uma onda que vai do focinho ao rabo (x do modelo: cabeça -0.49 .. rabo +0.49)
function dobra(xm, t) {
  const q = clamp((xm + 0.5) / 1.0, 0, 1);            // 0 cabeça .. 1 ponta do rabo
  return (0.012 + 0.115 * q * q) * Math.sin(t * 13 - 3.4 * q);
}

export function criar(canvas, { largura, altura, dpr = 1, lado = 1, dados }) {
  const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'low-power' });
  renderer.setPixelRatio(Math.min(dpr, 1.75)); renderer.setSize(largura, altura, false);
  renderer.setClearColor(0x000000, 0);
  const cena = new Scene(); cena.fog = new Fog(0x1d7565, 6, 20);
  const aspecto = largura / altura;
  const cam = new PerspectiveCamera(45, aspecto, 0.1, 60); cam.position.set(0, 0.3, 7); cam.lookAt(0, 0, 0);
  // ambiente de reflexo (sem arquivo): cúpula de gradiente com painéis claros
  const amb = new Scene();
  const cv = document.createElement('canvas'); cv.width = 4; cv.height = 256; const cx = cv.getContext('2d');
  const gg = cx.createLinearGradient(0, 0, 0, 256); gg.addColorStop(0, '#fbfdfb'); gg.addColorStop(.45, '#d3dfd8'); gg.addColorStop(.55, '#8faea3'); gg.addColorStop(1, '#1d4a42');
  cx.fillStyle = gg; cx.fillRect(0, 0, 4, 256);
  const tg = new CanvasTexture(cv); tg.colorSpace = SRGBColorSpace;
  amb.add(new Mesh(new SphereGeometry(20, 32, 16), new MeshBasicMaterial({ map: tg, side: BackSide })));
  for (const [px, py, pz, w] of [[6, 8, 6, 9], [-8, 5, 3, 6], [2, 9, -9, 7]]) { const pl = new Mesh(new PlaneGeometry(w, w * 0.6), new MeshBasicMaterial({ color: 0xffffff, side: DoubleSide })); pl.position.set(px, py, pz); pl.lookAt(0, 0, 0); amb.add(pl); }
  const pm = new PMREMGenerator(renderer); cena.environment = pm.fromScene(amb, 0.04).texture; pm.dispose();
  cena.add(new HemisphereLight(0xd6f0e8, 0x4d8a7a, 0.8));
  const sol = new DirectionalLight(0xffffff, 2.2); sol.position.set(3, 6, 7); cena.add(sol);
  const contra = new DirectionalLight(0x7fe0cb, 0.7); contra.position.set(-5, 1, -4); cena.add(contra);

  const { grupo, geo, base } = montarPeixe(dados);
  const raiz = new Group(); const giro = new Group();
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
    const p = geo.attributes.position, t = est.t;
    for (let i = 0; i < p.count; i++) p.array[i * 3 + 2] = base[i * 3 + 2] + dobra(base[i * 3], t);
    p.needsUpdate = true;
  }
  return {
    raiz, giro, est, pose, ondular,
    get t() { return est.t; }, TOTAL,
    passo(dt) { est.t += dt; pose(dt); ondular(); },
    desenhar() { renderer.render(cena, cam); },
    fade() { return 1 - easeIO((est.t - (TOTAL - 0.9)) / 0.7); },
    fim() { return est.t >= TOTAL; },
    destruir() { renderer.dispose(); cena.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) { for (const k of ['map', 'normalMap']) o.material[k] && o.material[k].dispose(); o.material.dispose(); } }); },
  };
}
