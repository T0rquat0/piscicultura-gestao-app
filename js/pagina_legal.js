// Termos e privacidade: aviso de minuta e data da versão. Em arquivo próprio porque a CSP do site bloqueia script embutido.
import { TERMOS_VERSAO } from './config.js';
  if (!TERMOS_VERSAO) document.getElementById('minuta').hidden = false;
  else document.querySelectorAll('[data-versao]').forEach((e) => { const [a, m, d] = TERMOS_VERSAO.split('-'); e.textContent = `${d}/${m}/${a}`; });
