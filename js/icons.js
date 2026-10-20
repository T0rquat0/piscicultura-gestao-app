// Ícones de linha (SVG inline, herdam a cor do texto).
const P = {
  inicio: '<path d="M4 11.2 12 4.5l8 6.7V19a1 1 0 0 1-1 1h-4.5v-5.5h-5V20H5a1 1 0 0 1-1-1z"/>',
  lancar: '<path d="M12 5v14M5 12h14"/>',
  relatorio: '<path d="M5 20V10M12 20V4M19 20v-7"/>',
  mais: '<path d="M5 7h14M5 12h14M5 17h14"/>',
  tanque: '<ellipse cx="12" cy="6.5" rx="7" ry="2.7"/><path d="M5 6.5v11c0 1.5 3.1 2.7 7 2.7s7-1.2 7-2.7v-11"/><path d="M5 12c0 1.5 3.1 2.7 7 2.7s7-1.2 7-2.7"/>',
  estoque: '<path d="M4 8.2 12 4l8 4.2v7.6L12 20l-8-4.2z"/><path d="M4 8.2 12 12.5l8-4.3M12 12.5V20"/>',
  equipe: '<circle cx="9" cy="8.5" r="3.2"/><path d="M3.5 19.5c.4-3.3 2.6-5 5.5-5s5.1 1.7 5.5 5"/><circle cx="17" cy="9.5" r="2.4"/><path d="M16.5 14.7c2.4.1 3.8 1.6 4.2 4.3"/>',
  pendentes: '<path d="M20 12a8 8 0 0 1-13.7 5.6M4 12a8 8 0 0 1 13.7-5.6"/><path d="M18 3v4h-4M6 21v-4h4"/>',
  direita: '<path d="m9.5 6 6 6-6 6"/>',
  voltar: '<path d="m14.5 6-6 6 6 6"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  peixe: '<g fill="currentColor" stroke="none"><path d="M1.4 4.6 7.2 12l-5.8 7.4L3.6 12z"/><rect x="8.2" y="9.5" width="2.4" height="5" rx="1.2"/><rect x="11.4" y="7" width="2.4" height="10" rx="1.2"/><rect x="14.6" y="5.5" width="2.4" height="13" rx="1.2"/><path fill-rule="evenodd" d="M17.8 9.7a1.2 1.2 0 0 1 2.4 0v4.6a1.2 1.2 0 0 1-2.4 0zM18.2 10.9a.8.8 0 1 0 1.6 0 .8.8 0 1 0-1.6 0z"/></g>',
};
export function icone(nome, tam = 24) {
  return `<svg class="ic" width="${tam}" height="${tam}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[nome] || ''}</svg>`;
}
