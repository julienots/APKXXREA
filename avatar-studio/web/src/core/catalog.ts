import type { Item, Rarity, Slot } from './types';

export const APP_VERSION = '1.0.0';
export const STUDIO_NAME = 'SuperEssence Studio';
export const APP_NAME = 'Avatar Studio';
/** Indicative price shown on the Pro screen. Subscription is managed by the developer. */
export const PRO_PRICE_LABEL = '4,99 EUR / mois';

export interface Collection {
  id: string;
  name: string;
  tagline: string;
  kind: 'saison' | 'theme' | 'evenement' | 'rare';
  /** Gradient used for banners. */
  colors: [string, string];
  until?: string;
  from?: string;
  reward: number;
  rewardTitle: string;
}

export const COLLECTIONS: Collection[] = [
  { id: 'basics', name: 'Les Essentiels', tagline: 'Tout pour bien démarrer', kind: 'theme', colors: ['#2b2b33', '#55556a'], reward: 150, rewardTitle: 'Débutant confirmé' },
  { id: 'neon', name: 'Saison 1 - Néon Pulse', tagline: 'La ville ne dort jamais', kind: 'saison', colors: ['#ff2fa8', '#3b2cff'], reward: 600, rewardTitle: 'Icône Néon' },
  { id: 'spectral', name: 'Halloween Spectral', tagline: 'Événement limité', kind: 'evenement', colors: ['#ff7a1a', '#5b1a8f'], until: '2026-11-16', reward: 800, rewardTitle: 'Âme Spectrale' },
  { id: 'feerie', name: 'Royaume Féérique', tagline: 'Magie, ailes et lumière', kind: 'theme', colors: ['#7af0c9', '#b06bff'], reward: 500, rewardTitle: 'Gardien des Fées' },
  { id: 'ronin', name: 'Cyber Ronin', tagline: 'Honneur et circuits', kind: 'theme', colors: ['#ff3b3b', '#1b1b25'], reward: 500, rewardTitle: 'Ronin Numérique' },
  { id: 'givre', name: 'Saison 2 - Hiver Givré', tagline: 'Accès anticipé Pro', kind: 'saison', colors: ['#bfe9ff', '#3a6df0'], from: '2026-12-01', reward: 700, rewardTitle: 'Cœur de Givre' },
  { id: 'legendes', name: 'Objets Légendaires', tagline: 'Les plus rares du studio', kind: 'rare', colors: ['#ffcd20', '#ff6a00'], reward: 1500, rewardTitle: 'Légende Vivante' },
];

const V = APP_VERSION;
function it(slot: Slot, id: string, name: string, style: string, price: number, rarity: Rarity, extra: Partial<Item> = {}): Item {
  return { id, slot, name, style, price, rarity, addedIn: V, ...extra };
}

export const ITEMS: Item[] = [
  // ---------------------------------------------------------------- bases
  it('base', 'base-human', 'Humain', 'human', 0, 'commun', { collection: 'basics' }),
  it('base', 'base-elf', 'Elfe', 'elf', 0, 'commun', { collection: 'basics' }),
  it('base', 'base-neko', 'Néko', 'neko', 250, 'rare', { collection: 'feerie' }),
  it('base', 'base-fox', 'Kitsune', 'fox', 400, 'epique', { collection: 'feerie' }),
  it('base', 'base-robot', 'Androïde', 'robot', 450, 'epique', { collection: 'ronin' }),
  it('base', 'base-demon', 'Démon', 'demon', 500, 'epique', { collection: 'spectral', until: '2026-11-16' }),
  it('base', 'base-ghost', 'Spectre', 'ghost', 900, 'legendaire', { collection: 'legendes', pro: true }),

  // ---------------------------------------------------------------- hair
  it('hair', 'hair-short', 'Court', 'short', 0, 'commun', { collection: 'basics' }),
  it('hair', 'hair-medium', 'Mi-long', 'medium', 0, 'commun', { collection: 'basics' }),
  it('hair', 'hair-long', 'Long', 'long', 0, 'commun', { collection: 'basics' }),
  it('hair', 'hair-pony', 'Queue de cheval', 'ponytail', 120, 'commun', { collection: 'basics' }),
  it('hair', 'hair-twin', 'Couettes', 'twintails', 200, 'rare', { collection: 'neon' }),
  it('hair', 'hair-bob', 'Carré', 'bob', 120, 'commun'),
  it('hair', 'hair-bun', 'Chignon', 'bun', 150, 'rare', { collection: 'ronin' }),
  it('hair', 'hair-spiky', 'Hérissé', 'spiky', 180, 'rare', { collection: 'neon' }),
  it('hair', 'hair-afro', 'Afro', 'afro', 180, 'rare'),
  it('hair', 'hair-wolf', 'Wolf cut', 'wolf', 260, 'epique', { collection: 'ronin' }),
  it('hair', 'hair-princess', 'Boucles royales', 'princess', 350, 'epique', { collection: 'feerie' }),
  it('hair', 'hair-frost', 'Mèches givrées', 'frost', 400, 'epique', { collection: 'givre', from: '2026-12-01' }),
  it('hair', 'hair-buzz', 'Rasé', 'buzz', 0, 'commun'),

  // ---------------------------------------------------------------- eyes
  it('eyes', 'eyes-round', 'Ronds', 'round', 0, 'commun', { collection: 'basics' }),
  it('eyes', 'eyes-sharp', 'Perçants', 'sharp', 0, 'commun', { collection: 'basics' }),
  it('eyes', 'eyes-sleepy', 'Endormis', 'sleepy', 80, 'commun'),
  it('eyes', 'eyes-sparkle', 'Étincelants', 'sparkle', 220, 'rare', { collection: 'feerie' }),
  it('eyes', 'eyes-cat', 'Félins', 'cat', 220, 'rare', { collection: 'spectral', until: '2026-11-16' }),
  it('eyes', 'eyes-cyber', 'Cybernétiques', 'cyber', 320, 'epique', { collection: 'ronin' }),
  it('eyes', 'eyes-galaxy', 'Galaxie', 'galaxy', 700, 'legendaire', { collection: 'legendes', pro: true }),

  // ---------------------------------------------------------------- brows
  it('brows', 'brows-soft', 'Doux', 'soft', 0, 'commun'),
  it('brows', 'brows-thick', 'Épais', 'thick', 0, 'commun'),
  it('brows', 'brows-thin', 'Fins', 'thin', 60, 'commun'),
  it('brows', 'brows-dots', 'Points', 'dots', 120, 'rare', { collection: 'feerie' }),

  // ---------------------------------------------------------------- mouth
  it('mouth', 'mouth-classic', 'Classique', 'classic', 0, 'commun'),
  it('mouth', 'mouth-cat', 'Chat', 'cat', 90, 'commun', { collection: 'neon' }),
  it('mouth', 'mouth-fang', 'Canine', 'fang', 150, 'rare', { collection: 'spectral', until: '2026-11-16' }),
  it('mouth', 'mouth-lips', 'Lèvres', 'lips', 90, 'commun'),

  // ---------------------------------------------------------------- outfits
  it('outfit', 'outfit-tee', 'T-shirt', 'tee', 0, 'commun', { collection: 'basics', color: '#f2f2f2', color2: '#2d3142' }),
  it('outfit', 'outfit-hoodie', 'Sweat à capuche', 'hoodie', 0, 'commun', { collection: 'basics', color: '#3a3a48', color2: '#ffcd20' }),
  it('outfit', 'outfit-jacket', 'Veste urbaine', 'jacket', 200, 'rare', { collection: 'neon', color: '#16161f', color2: '#ff2fa8' }),
  it('outfit', 'outfit-dress', 'Robe', 'dress', 180, 'rare', { color: '#e84a6f', color2: '#ffffff' }),
  it('outfit', 'outfit-suit', 'Costume', 'suit', 260, 'rare', { color: '#1d1f2b', color2: '#c0392b' }),
  it('outfit', 'outfit-kimono', 'Kimono', 'kimono', 320, 'epique', { collection: 'ronin', color: '#24243a', color2: '#ff3b3b' }),
  it('outfit', 'outfit-armor', 'Armure néon', 'armor', 480, 'epique', { collection: 'ronin', color: '#2a2d3a', color2: '#00e5ff' }),
  it('outfit', 'outfit-witch', 'Robe de sorcière', 'witch', 380, 'epique', { collection: 'spectral', until: '2026-11-16', color: '#2c1440', color2: '#ff7a1a' }),
  it('outfit', 'outfit-fairy', 'Tunique féérique', 'fairy', 340, 'epique', { collection: 'feerie', color: '#8ef0cf', color2: '#c58bff' }),
  it('outfit', 'outfit-neon', 'Sweat Néon Pulse', 'neon', 300, 'epique', { collection: 'neon', color: '#101018', color2: '#39ff88' }),
  it('outfit', 'outfit-parka', 'Parka polaire', 'parka', 360, 'epique', { collection: 'givre', from: '2026-12-01', color: '#e8f4ff', color2: '#3a6df0' }),
  it('outfit', 'outfit-royal', 'Tenue royale', 'royal', 1200, 'legendaire', { collection: 'legendes', color: '#4b1d6b', color2: '#ffcd20' }),

  // ---------------------------------------------------------------- accessories
  it('accessory', 'acc-glasses', 'Lunettes', 'glasses', 0, 'commun', { collection: 'basics' }),
  it('accessory', 'acc-sunglasses', 'Lunettes de soleil', 'sunglasses', 120, 'commun', { collection: 'neon' }),
  it('accessory', 'acc-headphones', 'Casque audio', 'headphones', 150, 'rare', { collection: 'neon' }),
  it('accessory', 'acc-cap', 'Casquette', 'cap', 100, 'commun'),
  it('accessory', 'acc-beanie', 'Bonnet', 'beanie', 100, 'commun', { collection: 'givre', from: '2026-12-01' }),
  it('accessory', 'acc-catears', 'Oreilles de chat', 'catears', 140, 'rare', { collection: 'feerie' }),
  it('accessory', 'acc-bunny', 'Oreilles de lapin', 'bunny', 180, 'rare'),
  it('accessory', 'acc-horns', 'Cornes', 'horns', 220, 'rare', { collection: 'spectral', until: '2026-11-16' }),
  it('accessory', 'acc-witchhat', 'Chapeau de sorcière', 'witchhat', 300, 'epique', { collection: 'spectral', until: '2026-11-16' }),
  it('accessory', 'acc-halo', 'Auréole', 'halo', 260, 'epique', { collection: 'feerie' }),
  it('accessory', 'acc-wings', 'Ailes de fée', 'wings', 420, 'epique', { collection: 'feerie' }),
  it('accessory', 'acc-crown', 'Couronne', 'crown', 800, 'legendaire', { collection: 'legendes' }),
  it('accessory', 'acc-mask', 'Masque ronin', 'mask', 260, 'epique', { collection: 'ronin' }),
  it('accessory', 'acc-scarf', 'Écharpe', 'scarf', 120, 'commun', { collection: 'givre', from: '2026-12-01' }),
  it('accessory', 'acc-bow', 'Nœud', 'bow', 80, 'commun'),
  it('accessory', 'acc-flower', 'Fleur', 'flower', 80, 'commun', { collection: 'feerie' }),
  it('accessory', 'acc-tail', 'Queue', 'tail', 200, 'rare'),
  it('accessory', 'acc-antenna', 'Antenne', 'antenna', 120, 'rare', { collection: 'ronin' }),
  it('accessory', 'acc-earrings', 'Boucles d\'oreilles', 'earrings', 90, 'commun'),

  // ---------------------------------------------------------------- expressions
  it('expression', 'exp-joy', 'Rire', 'joy', 0, 'commun', { collection: 'basics' }),
  it('expression', 'exp-surprise', 'Surprise', 'surprise', 0, 'commun', { collection: 'basics' }),
  it('expression', 'exp-cry', 'Pleurer', 'cry', 0, 'commun', { pro: true }),
  it('expression', 'exp-angry', 'Colère', 'angry', 0, 'commun', { pro: true }),
  it('expression', 'exp-love', 'Amoureux', 'love', 150, 'rare', { collection: 'feerie' }),
  it('expression', 'exp-shy', 'Timide', 'shy', 120, 'rare'),
  it('expression', 'exp-wow', 'Émerveillé', 'wow', 160, 'rare', { collection: 'neon' }),
  it('expression', 'exp-gloom', 'Déprime', 'gloom', 160, 'rare', { collection: 'spectral', until: '2026-11-16' }),
  it('expression', 'exp-sleepy', 'Somnolent', 'sleepy', 100, 'commun'),
  it('expression', 'exp-dizzy', 'Étourdi', 'dizzy', 180, 'rare', { pro: true }),
  it('expression', 'exp-smug', 'Malicieux', 'smug', 140, 'rare', { collection: 'ronin' }),

  // ---------------------------------------------------------------- animations
  it('animation', 'anim-wave', 'Coucou', 'wave', 0, 'commun', { collection: 'basics' }),
  it('animation', 'anim-nod', 'Hochement', 'nod', 0, 'commun', { collection: 'basics' }),
  it('animation', 'anim-clap', 'Applaudir', 'clap', 80, 'commun'),
  it('animation', 'anim-bow', 'Révérence', 'bow', 80, 'commun'),
  it('animation', 'anim-victory', 'Victoire', 'victory', 120, 'rare'),
  it('animation', 'anim-heart', 'Cœur', 'heart', 150, 'rare', { collection: 'feerie' }),
  it('animation', 'anim-think', 'Réflexion', 'think', 100, 'commun'),
  it('animation', 'anim-shrug', 'Haussement', 'shrug', 100, 'commun'),
  it('animation', 'anim-facepalm', 'Facepalm', 'facepalm', 140, 'rare'),
  it('animation', 'anim-dance-bounce', 'Danse Bounce', 'bounce', 250, 'rare', { collection: 'neon' }),
  it('animation', 'anim-dance-robot', 'Danse Robot', 'robot', 300, 'epique', { collection: 'ronin' }),
  it('animation', 'anim-dance-disco', 'Danse Disco', 'disco', 300, 'epique', { collection: 'neon' }),
  it('animation', 'anim-dance-spooky', 'Danse Spooky', 'spooky', 350, 'epique', { collection: 'spectral', until: '2026-11-16' }),
  it('animation', 'anim-dance-star', 'Danse Étoile', 'star', 600, 'legendaire', { collection: 'legendes', pro: true }),

  // ---------------------------------------------------------------- backgrounds
  it('background', 'bg-studio', 'Studio', 'studio', 0, 'commun', { collection: 'basics' }),
  it('background', 'bg-gradient', 'Dégradé', 'gradient', 0, 'commun', { collection: 'basics' }),
  it('background', 'bg-room', 'Chambre gamer', 'room', 0, 'commun'),
  it('background', 'bg-chroma', 'Fond vert', 'chroma', 0, 'commun'),
  it('background', 'bg-neon', 'Ville néon', 'neon', 300, 'epique', { collection: 'neon' }),
  it('background', 'bg-cosmos', 'Cosmos', 'cosmos', 250, 'rare'),
  it('background', 'bg-forest', 'Forêt enchantée', 'forest', 250, 'rare', { collection: 'feerie' }),
  it('background', 'bg-beach', 'Plage au crépuscule', 'beach', 200, 'rare'),
  it('background', 'bg-dojo', 'Dojo cyber', 'dojo', 320, 'epique', { collection: 'ronin' }),
  it('background', 'bg-haunted', 'Manoir hanté', 'haunted', 350, 'epique', { collection: 'spectral', until: '2026-11-16' }),
  it('background', 'bg-snow', 'Sommet enneigé', 'snow', 320, 'epique', { collection: 'givre', from: '2026-12-01' }),
  it('background', 'bg-throne', 'Salle du trône', 'throne', 900, 'legendaire', { collection: 'legendes' }),
  it('background', 'bg-custom', 'Image perso', 'custom', 0, 'rare', { pro: true }),
];

export const ITEM_BY_ID: Record<string, Item> = Object.fromEntries(ITEMS.map((i) => [i.id, i]));

export function item(id: string): Item | undefined {
  return ITEM_BY_ID[id];
}

export function itemsOf(slot: Slot): Item[] {
  return ITEMS.filter((i) => i.slot === slot);
}

export const SLOT_LABEL: Record<Slot, string> = {
  base: 'Base',
  hair: 'Coiffures',
  eyes: 'Yeux',
  brows: 'Sourcils',
  mouth: 'Bouches',
  outfit: 'Tenues',
  accessory: 'Accessoires',
  expression: 'Expressions',
  animation: 'Animations',
  background: 'Décors',
};

export const RARITY_LABEL: Record<Rarity, string> = {
  commun: 'Commun',
  rare: 'Rare',
  epique: 'Épique',
  legendaire: 'Légendaire',
};

export const RARITY_COLOR: Record<Rarity, string> = {
  commun: '#9aa0b4',
  rare: '#3fa9ff',
  epique: '#b56bff',
  legendaire: '#ffcd20',
};

export const SKIN_TONES = ['#ffe6d5', '#fcd5b8', '#f1c09b', '#e0a57c', '#c68660', '#9c6444', '#6e4430', '#4a2c20', '#cfe4ff', '#d8ffe9', '#ffd6f0', '#c9c9d6'];
export const HAIR_COLORS = ['#1b1b22', '#3b2a22', '#6b4426', '#b07a45', '#e8c27a', '#f5f0e6', '#c0c4d6', '#d63a3a', '#ff7aa8', '#b06bff', '#3a6df0', '#26c6da', '#39d98a', '#ffcd20', '#ff7a1a'];
export const EYE_COLORS = ['#3a2618', '#6b4426', '#2b7bd6', '#26a69a', '#4caf50', '#8e5bd6', '#d63a3a', '#ff7aa8', '#ffcd20', '#9aa0b4', '#00e5ff', '#ff2fa8'];
export const CLOTH_COLORS = ['#f2f2f2', '#1b1b22', '#3a3a48', '#2d3142', '#c0392b', '#e84a6f', '#ff7a1a', '#ffcd20', '#39d98a', '#26c6da', '#3a6df0', '#8e5bd6', '#ff2fa8', '#6b4426', '#8ef0cf', '#bfe9ff'];

export interface NewsEntry {
  version: string;
  date: string;
  title: string;
  body: string;
  colors: [string, string];
  action?: { label: string; route: string };
  tag: 'nouveau' | 'evenement' | 'bientot' | 'technologie';
}

export const NEWS: NewsEntry[] = [
  { version: '1.0.0', date: '2026-11-04', tag: 'evenement', title: 'Halloween Spectral est là', body: 'Base Démon, robe de sorcière, Manoir hanté et la Danse Spooky. Disponible jusqu\'au 16 novembre seulement.', colors: ['#ff7a1a', '#5b1a8f'], action: { label: 'Voir la collection', route: 'collections:spectral' } },
  { version: '1.0.0', date: '2026-11-04', tag: 'nouveau', title: 'Saison 1 - Néon Pulse', body: 'Couettes, veste urbaine, casque audio, Ville néon et deux danses exclusives. Complétez la collection pour débloquer le titre Icône Néon.', colors: ['#ff2fa8', '#3b2cff'], action: { label: 'Ouvrir la boutique', route: 'shop' } },
  { version: '1.0.0', date: '2026-11-04', tag: 'technologie', title: 'Synchronisation labiale par voyelles', body: 'La bouche de votre avatar reconnaît maintenant les sons A, E, I, O et U en analysant les formants de votre voix, en plus du volume et du rythme.', colors: ['#39d98a', '#1b6b4a'] },
  { version: '1.0.0', date: '2026-11-04', tag: 'technologie', title: 'Suivi des mains (bêta)', body: 'Levez la main devant la caméra : votre avatar la lève aussi. A activer dans Profil, Paramètres.', colors: ['#3fa9ff', '#1b2b6b'], action: { label: 'Paramètres', route: 'profile' } },
  { version: '1.0.0', date: '2026-11-04', tag: 'nouveau', title: 'Physique des cheveux et accessoires', body: 'Queues de cheval, couettes, oreilles et ailes réagissent maintenant aux mouvements de la tête grâce à une simulation de ressorts.', colors: ['#b56bff', '#3b1a6b'] },
  { version: '1.1.0', date: '2026-12-01', tag: 'bientot', title: 'Saison 2 - Hiver Givré', body: 'Parka polaire, mèches givrées, Sommet enneigé. Les membres Pro y ont déjà accès en avant-première.', colors: ['#bfe9ff', '#3a6df0'], action: { label: 'Découvrir Pro', route: 'pro' } },
];

export interface Mission {
  id: string;
  label: string;
  goal: number;
  reward: number;
  stat: 'recordings' | 'expressions' | 'liveSeconds' | 'animations' | 'trackedSeconds';
}

export const DAILY_MISSIONS: Mission[] = [
  { id: 'm-rec', label: 'Enregistrer une vidéo', goal: 1, reward: 40, stat: 'recordings' },
  { id: 'm-exp', label: 'Déclencher 5 expressions', goal: 5, reward: 25, stat: 'expressions' },
  { id: 'm-anim', label: 'Lancer 3 animations', goal: 3, reward: 25, stat: 'animations' },
  { id: 'm-track', label: 'Animer votre avatar 2 minutes', goal: 120, reward: 30, stat: 'trackedSeconds' },
];
