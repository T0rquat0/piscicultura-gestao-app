// Previsão do tempo da fazenda (Open-Meteo, gratuito e sem cadastro) e avisos de manejo.
// A localização vem do aparelho (uma vez) e fica guardada nele; a previsão é guardada por algumas horas.
import * as db from './db.js';
import { CLIMA } from './config.js';

const URL_API = 'https://api.open-meteo.com/v1/forecast';

export const localGuardado = () => db.kvGet('climaLocal');

export function pedirLocal() {
  return new Promise((ok, falha) => {
    if (!navigator.geolocation) return falha(new Error('Este aparelho não informa a localização.'));
    navigator.geolocation.getCurrentPosition(
      async (p) => { const l = { lat: Math.round(p.coords.latitude * 100) / 100, lon: Math.round(p.coords.longitude * 100) / 100 }; await db.kvSet('climaLocal', l); ok(l); },
      () => falha(new Error('Sem permissão para a localização. Libere nas configurações do navegador.')),
      { timeout: 15000, maximumAge: 864e5 });
  });
}

// devolve { dias: [{data, max, min, chuva, codigo}], em } ou null; usa a guardada se ainda valer ou se estiver sem internet
export async function previsao(local) {
  const guardada = await db.kvGet('climaPrev');
  const valida = guardada && guardada.lat === local.lat && guardada.lon === local.lon;
  if (valida && (Date.now() - guardada.em < CLIMA.validadeMin * 6e4 || !navigator.onLine)) return guardada;
  if (!navigator.onLine) return null;
  try {
    const q = `latitude=${local.lat}&longitude=${local.lon}&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,weather_code&timezone=auto&forecast_days=4`;
    const r = await fetch(`${URL_API}?${q}`);
    if (!r.ok) throw new Error('clima');
    const j = await r.json(), d = j.daily;
    const dados = { lat: local.lat, lon: local.lon, em: Date.now(), dias: d.time.map((t, i) => ({ data: t, max: d.temperature_2m_max[i], min: d.temperature_2m_min[i], chuva: d.precipitation_sum[i], codigo: d.weather_code[i] })) };
    await db.kvSet('climaPrev', dados);
    return dados;
  } catch { return valida ? guardada : null; }
}

// código WMO → texto curto
export function descricao(c) {
  if (c === 0) return 'Céu limpo';
  if (c <= 2) return 'Poucas nuvens';
  if (c === 3) return 'Nublado';
  if (c === 45 || c === 48) return 'Neblina';
  if (c >= 51 && c <= 57) return 'Garoa';
  if ((c >= 61 && c <= 67) || (c >= 80 && c <= 82)) return 'Chuva';
  if (c >= 95) return 'Temporal';
  return 'Tempo variável';
}

// Avisos de manejo para hoje e amanhã (função pura, testável). nivel: 'alerta' | 'atencao'
export function avisosClima(dias, c = CLIMA) {
  const av = [];
  const [hoje, amanha] = dias;
  for (const [d, quando] of [[hoje, 'hoje'], [amanha, 'amanhã']]) {
    if (!d) continue;
    if (d.min < c.friagemMinC) av.push({ nivel: 'alerta', txt: `Friagem ${quando} (mínima de ${Math.round(d.min)} °C): o peixe come menos com água fria. Reduza a ração e observe a sobra.` });
    if (d.chuva >= c.chuvaForteMm) av.push({ nivel: 'alerta', txt: `Chuva forte ${quando} (${Math.round(d.chuva)} mm): o oxigênio da água pode cair. Reduza a ração e deixe os aeradores prontos.` });
    if (d.max >= c.calorMaxC) av.push({ nivel: 'atencao', txt: `Calor forte ${quando} (máxima de ${Math.round(d.max)} °C): água quente segura menos oxigênio. Prefira tratar nas horas mais frescas.` });
  }
  if (hoje && amanha && hoje.min - amanha.min >= c.quedaC) av.push({ nivel: 'alerta', txt: `A temperatura cai amanhã (mínima de ${Math.round(hoje.min)} para ${Math.round(amanha.min)} °C). Mudança brusca deixa o peixe sem apetite: reduza a ração.` });
  // um aviso por tipo é suficiente: hoje tem prioridade sobre amanhã
  const vistos = new Set();
  return av.filter((a) => { const k = a.txt.split(' ')[0]; if (vistos.has(k)) return false; vistos.add(k); return true; });
}
