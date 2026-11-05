/** Hand-made SVG icon set (stroke icons, 24x24). No emoji anywhere in the app. */
const P: Record<string, string> = {
  studio: '<path d="M4 7h11a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2z"/><path d="M17 10l5-3v10l-5-3"/>',
  create: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/><path d="M18 3l1 2 2 1-2 1-1 2-1-2-2-1 2-1z"/>',
  shop: '<path d="M4 8h16l-1.5 11a2 2 0 0 1-2 2h-9a2 2 0 0 1-2-2z"/><path d="M8 8V6a4 4 0 0 1 8 0v2"/>',
  collections: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><path d="M17.5 14l1.2 2.4 2.6.4-1.9 1.8.5 2.6-2.4-1.2-2.4 1.2.5-2.6-1.9-1.8 2.6-.4z"/>',
  profile: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/>',
  bell: '<path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4z"/><path d="M10 21h4"/>',
  gem: '<path d="M6 3h12l4 6-10 12L2 9z"/><path d="M2 9h20M9 3l3 18 3-18"/>',
  record: '<circle cx="12" cy="12" r="8" fill="currentColor" stroke="none"/>',
  stop: '<rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor" stroke="none"/>',
  pause: '<rect x="6" y="5" width="4" height="14" rx="1" fill="currentColor" stroke="none"/><rect x="14" y="5" width="4" height="14" rx="1" fill="currentColor" stroke="none"/>',
  play: '<path d="M7 5l12 7-12 7z" fill="currentColor" stroke="none"/>',
  live: '<circle cx="12" cy="12" r="2.5" fill="currentColor"/><path d="M7.8 7.8a6 6 0 0 0 0 8.4M16.2 7.8a6 6 0 0 1 0 8.4M5 5a10 10 0 0 0 0 14M19 5a10 10 0 0 1 0 14"/>',
  camera: '<path d="M3 8a2 2 0 0 1 2-2h2l2-2h6l2 2h2a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><circle cx="12" cy="13" r="4"/>',
  cameraOff: '<path d="M3 8a2 2 0 0 1 2-2h2l2-2h6l2 2h2a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M3 3l18 18"/>',
  mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>',
  micOff: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3M3 3l18 18"/>',
  frame: '<path d="M3 8V5a2 2 0 0 1 2-2h3M16 3h3a2 2 0 0 1 2 2v3M21 16v3a2 2 0 0 1-2 2h-3M8 21H5a2 2 0 0 1-2-2v-3"/><circle cx="12" cy="10" r="3"/><path d="M7 18c1-2 3-3 5-3s4 1 5 3"/>',
  aspect: '<rect x="7" y="2" width="10" height="20" rx="2"/>',
  aspectWide: '<rect x="2" y="7" width="20" height="10" rx="2"/>',
  aspectSquare: '<rect x="4" y="4" width="16" height="16" rx="2"/>',
  background: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 16l5-5 4 4 3-3 6 6"/><circle cx="16" cy="9" r="1.5"/>',
  expression: '<circle cx="12" cy="12" r="9"/><path d="M8 14c1 1.5 2.5 2 4 2s3-.5 4-2"/><path d="M9 9.5h.01M15 9.5h.01" stroke-width="3"/>',
  animation: '<circle cx="13" cy="4" r="2"/><path d="M9 21l2-6 3 2v4M7 11l3-3 4 1 3 3M11 15l-1-4"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  check: '<path d="M5 12l5 5 9-10"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  star: '<path d="M12 3l2.6 5.6 6 .7-4.5 4.1 1.2 6L12 16.5 6.7 19.4l1.2-6L3.4 9.3l6-.7z"/>',
  crown: '<path d="M3 8l4.5 4L12 5l4.5 7L21 8l-2 11H5z"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  share: '<circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="6" r="2.5"/><circle cx="18" cy="18" r="2.5"/><path d="M8.2 10.8l7.6-3.6M8.2 13.2l7.6 3.6"/>',
  download: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1V21a2 2 0 0 1-4 0v-.1A1.6 1.6 0 0 0 7.4 19.6l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.6 1.6 0 0 0 3.5 14H3a2 2 0 0 1 0-4h.1a1.6 1.6 0 0 0 1.3-2.7l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.6 1.6 0 0 0 10 3.4V3a2 2 0 0 1 4 0v.1a1.6 1.6 0 0 0 2.7 1.1l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1A1.6 1.6 0 0 0 20.6 10H21a2 2 0 0 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z"/>',
  target: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  upload: '<path d="M12 20V9M7 14l5-5 5 5M5 4h14"/>',
  chevron: '<path d="M9 6l6 6-6 6"/>',
  back: '<path d="M15 6l-6 6 6 6"/>',
  sparkle: '<path d="M12 3c.5 4 2 5.5 6 6-4 .5-5.5 2-6 6-.5-4-2-5.5-6-6 4-.5 5.5-2 6-6z"/><path d="M19 15c.2 1.6.8 2.2 2.4 2.4-1.6.2-2.2.8-2.4 2.4-.2-1.6-.8-2.2-2.4-2.4 1.6-.2 2.2-.8 2.4-2.4z"/>',
  eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  hand: '<path d="M8 13V5.5a1.5 1.5 0 0 1 3 0V11M11 10V4.5a1.5 1.5 0 0 1 3 0V11M14 10.5V6a1.5 1.5 0 0 1 3 0v8a7 7 0 0 1-7 7h-.5a6 6 0 0 1-4.6-2.2L3 15.5a1.6 1.6 0 0 1 2.4-2L8 16"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.01" stroke-width="2.4"/>',
  gift: '<rect x="3" y="9" width="18" height="12" rx="1.5"/><path d="M3 13h18M12 9v12M12 9c-1.5-4-6-5-6-2s6 2 6 2zM12 9c1.5-4 6-5 6-2s-6 2-6 2z"/>',
  mirror: '<path d="M12 3v18" stroke-dasharray="2 2"/><path d="M9 7L4 12l5 5zM15 7l5 5-5 5z"/>',
  rotate: '<path d="M20 12a8 8 0 1 1-2.3-5.7M20 4v5h-5"/>',
  music: '<path d="M9 18V5l11-2v13"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="17.5" cy="16" r="2.5"/>',
  wave: '<path d="M7 12.5V6a1.5 1.5 0 0 1 3 0v5M10 10V4.5a1.5 1.5 0 0 1 3 0V10M13 10V5.5a1.5 1.5 0 0 1 3 0v8.5a7 7 0 0 1-7 7 6 6 0 0 1-5-3l-2-3.6a1.5 1.5 0 0 1 2.5-1.6L7 15"/><path d="M18 3c1.5 1 2.5 2.5 3 4.5"/>',
  heart: '<path d="M12 20s-8-4.8-8-11a4.5 4.5 0 0 1 8-2.8A4.5 4.5 0 0 1 20 9c0 6.2-8 11-8 11z"/>',
  bolt: '<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>',
  film: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M7 3v18M17 3v18M3 8h4M3 16h4M17 8h4M17 16h4"/>',
  key: '<circle cx="8" cy="15" r="4"/><path d="M11 12l9-9M17 6l3 3M14 9l2 2"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  layers: '<path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/>',
  sliders: '<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>',
  palette: '<path d="M12 3a9 9 0 1 0 0 18c1.1 0 1.5-.9 1.2-1.8-.4-1 .3-2.2 1.4-2.2H17a4 4 0 0 0 4-4c0-5.5-4-10-9-10z"/><circle cx="7.5" cy="11" r="1.2"/><circle cx="10" cy="7" r="1.2"/><circle cx="15" cy="7.5" r="1.2"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M14 6l4 4"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>',
  fullscreen: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
  zoom: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4M11 8v6M8 11h6"/>',
  timer: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2 2M9 2h6"/>',
};

export function icon(name: string, size = 22, extra = ''): string {
  return `<svg class="ic ${extra}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[name] ?? P.info}</svg>`;
}

/** Small vector faces for the expression buttons. */
export function faceIcon(style: string, size = 34): string {
  const eyes: Record<string, string> = {
    joy: '<path d="M8 11c.7-1.4 2.3-1.4 3 0M13 11c.7-1.4 2.3-1.4 3 0"/>',
    surprise: '<circle cx="9.5" cy="10.5" r="1.6"/><circle cx="14.5" cy="10.5" r="1.6"/>',
    cry: '<path d="M8 10.5h3M13 10.5h3"/><path d="M9.5 12v4M14.5 12v4" stroke="#8ccfff"/>',
    angry: '<path d="M7.5 8.5l3.5 1.5M16.5 8.5L13 10"/><circle cx="9.5" cy="11.5" r=".9" fill="currentColor"/><circle cx="14.5" cy="11.5" r=".9" fill="currentColor"/>',
    love: '<path d="M9.5 12.5s-2-1.2-2-2.6a1 1 0 0 1 2-.4 1 1 0 0 1 2 .4c0 1.4-2 2.6-2 2.6zM14.5 12.5s-2-1.2-2-2.6a1 1 0 0 1 2-.4 1 1 0 0 1 2 .4c0 1.4-2 2.6-2 2.6z" fill="#ff4f8b" stroke="#ff4f8b"/>',
    shy: '<path d="M8.5 10.5h2M13.5 10.5h2"/><path d="M6.5 13.5l1-1M8 14l1-1M15 14l1-1M16.5 13.5l1-1" stroke="#ff7aa0"/>',
    wow: '<path d="M9.5 8.5l.6 1.3 1.4.2-1 1 .2 1.4-1.2-.7-1.2.7.2-1.4-1-1 1.4-.2zM14.5 8.5l.6 1.3 1.4.2-1 1 .2 1.4-1.2-.7-1.2.7.2-1.4-1-1 1.4-.2z" fill="#ffcd20" stroke="#ffcd20"/>',
    gloom: '<path d="M8 11h3M13 11h3M8 5v2M10.5 4.5v2M13.5 4.5v2M16 5v2"/>',
    sleepy: '<path d="M8 11c.7.8 2.3.8 3 0M13 11c.7.8 2.3.8 3 0"/><path d="M17 5h2.5L17 7.5h2.5"/>',
    dizzy: '<path d="M8 9l3 3M11 9l-3 3M13 9l3 3M16 9l-3 3"/>',
    smug: '<path d="M8 10.5h3M13 11c.7-1 2.3-1 3 0"/>',
  };
  const mouths: Record<string, string> = {
    joy: '<path d="M8.5 14.5h7a3.5 3.5 0 0 1-7 0z" fill="currentColor"/>',
    surprise: '<ellipse cx="12" cy="16" rx="1.6" ry="2"/>',
    cry: '<path d="M9 17c1.5-1.6 4.5-1.6 6 0"/>',
    angry: '<path d="M9 16.5c1.5-1 4.5-1 6 0"/>',
    love: '<path d="M10 15c1 1 3 1 4 0"/>',
    shy: '<path d="M11 15.5h2"/>',
    wow: '<path d="M9.5 14.5h5a2.5 2.5 0 0 1-5 0z" fill="currentColor"/>',
    gloom: '<path d="M10 16.5c1-.6 3-.6 4 0"/>',
    sleepy: '<circle cx="12" cy="15.8" r="1.1"/>',
    dizzy: '<path d="M9 16c1-1 2 1 3 0s2 1 3 0"/>',
    smug: '<path d="M10 15.5c2 .8 3.5.2 4.5-1"/>',
  };
  return `<svg class="ic face" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10" fill="rgba(255,205,32,.12)" stroke="currentColor"/>${eyes[style] ?? eyes.joy}${mouths[style] ?? mouths.joy}</svg>`;
}

const ANIM_ICON: Record<string, string> = {
  wave: 'wave', nod: 'rotate', clap: 'hand', bow: 'crown', victory: 'star', heart: 'heart', think: 'info', shrug: 'hand', facepalm: 'hand',
  bounce: 'music', robot: 'bolt', disco: 'music', spooky: 'music', star: 'sparkle',
};
export function animIcon(style: string, size = 22): string {
  return icon(ANIM_ICON[style] ?? 'animation', size);
}
