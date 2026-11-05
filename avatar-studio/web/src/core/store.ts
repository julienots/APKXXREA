import { DAILY_MISSIONS, ITEMS, COLLECTIONS, item, APP_VERSION } from './catalog';
import type { AvatarConfig, Aspect, Framing, Item } from './types';

export interface Settings {
  mirror: boolean;
  swapEyes: boolean;
  smoothing: number; // 0..1
  sensitivity: number; // 0.5..2
  handTracking: boolean;
  gestureTriggers: boolean;
  mouthMode: 'mix' | 'camera' | 'voice';
  micGain: number;
  renderScale: number; // 0.5..1
  shadows: boolean;
  outline: boolean;
  quality: 'sd' | 'hd' | '4k';
  fps: 30 | 60;
  showCameraPreview: boolean;
  haptics: boolean;
}

export interface License {
  plan: 'pro';
  exp: string; // ISO date
  id: string;
  source: 'code' | 'trial';
}

export interface DayStats {
  day: string;
  recordings: number;
  expressions: number;
  liveSeconds: number;
  animations: number;
  trackedSeconds: number;
  claimed: string[];
}

export interface State {
  version: number;
  onboarded: boolean;
  lastSeenNews: string;
  coins: number;
  inventory: string[];
  avatars: AvatarConfig[];
  activeAvatar: string;
  background: string;
  bgColor: string;
  customBg?: string;
  aspect: Aspect;
  framing: Framing;
  settings: Settings;
  license?: License;
  trialUsed: boolean;
  lastDaily: string;
  day: DayStats;
  claimedCollections: string[];
  title?: string;
  calibration: { yaw: number; pitch: number; roll: number };
  totalRecordings: number;
}

const KEY = 'se-avatar-studio/v1';

export function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function uid(): string {
  return Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);
}

export function defaultAvatar(name = 'Mon avatar'): AvatarConfig {
  return {
    id: uid(),
    name,
    kind: 'toon',
    base: 'base-human',
    skin: '#fcd5b8',
    hair: 'hair-medium',
    hairColor: '#3b2a22',
    hairColor2: '#ffcd20',
    eyes: 'eyes-round',
    eyeColor: '#2b7bd6',
    brows: 'brows-soft',
    mouth: 'mouth-classic',
    outfit: 'outfit-hoodie',
    outfitColor: '#3a3a48',
    outfitColor2: '#ffcd20',
    accessories: [],
    accentColor: '#ffcd20',
    blush: 0.35,
    height: 1,
  };
}

function emptyDay(): DayStats {
  return { day: today(), recordings: 0, expressions: 0, liveSeconds: 0, animations: 0, trackedSeconds: 0, claimed: [] };
}

function initial(): State {
  const a = defaultAvatar();
  return {
    version: 1,
    onboarded: false,
    lastSeenNews: '',
    coins: 300,
    inventory: [],
    avatars: [a],
    activeAvatar: a.id,
    background: 'bg-studio',
    bgColor: '#00b140',
    aspect: '9:16',
    framing: 'bust',
    settings: {
      mirror: true,
      swapEyes: false,
      smoothing: 0.5,
      sensitivity: 1,
      handTracking: false,
      gestureTriggers: true,
      mouthMode: 'mix',
      micGain: 1,
      renderScale: 1,
      shadows: true,
      outline: true,
      quality: 'hd',
      fps: 30,
      showCameraPreview: false,
      haptics: true,
    },
    trialUsed: false,
    lastDaily: '',
    day: emptyDay(),
    claimedCollections: [],
    calibration: { yaw: 0, pitch: 0, roll: 0 },
    totalRecordings: 0,
  };
}

type Listener = (s: State) => void;

class Store {
  state: State;
  private listeners = new Set<Listener>();
  private saveTimer = 0;

  constructor() {
    this.state = this.load();
  }

  private load(): State {
    const base = initial();
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<State>;
        const s: State = { ...base, ...parsed, settings: { ...base.settings, ...(parsed.settings || {}) } } as State;
        if (!s.avatars?.length) s.avatars = base.avatars;
        if (!s.avatars.find((a) => a.id === s.activeAvatar)) s.activeAvatar = s.avatars[0].id;
        s.avatars = s.avatars.map((a) => ({ ...defaultAvatar(), ...a }));
        if (!s.day || s.day.day !== today()) s.day = emptyDay();
        return s;
      }
    } catch {
      /* corrupted storage: start fresh */
    }
    return base;
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  update(mut: (s: State) => void): void {
    mut(this.state);
    if (this.state.day.day !== today()) this.state.day = emptyDay();
    this.listeners.forEach((l) => l(this.state));
    clearTimeout(this.saveTimer);
    this.saveTimer = window.setTimeout(() => this.persist(), 250);
  }

  persist(): void {
    try {
      localStorage.setItem(KEY, JSON.stringify(this.state));
    } catch {
      /* storage full or unavailable */
    }
  }

  // ------------------------------------------------------------ avatars
  get avatar(): AvatarConfig {
    return this.state.avatars.find((a) => a.id === this.state.activeAvatar) || this.state.avatars[0];
  }

  updateAvatar(patch: Partial<AvatarConfig>): void {
    this.update((s) => {
      const a = s.avatars.find((x) => x.id === s.activeAvatar);
      if (a) Object.assign(a, patch);
    });
  }

  get maxAvatars(): number {
    return this.isPro ? 10 : 1;
  }

  // ------------------------------------------------------------ pro
  get isPro(): boolean {
    const l = this.state.license;
    return !!l && l.exp >= today();
  }

  get proDaysLeft(): number {
    const l = this.state.license;
    if (!l) return 0;
    return Math.max(0, Math.ceil((new Date(l.exp + 'T23:59:59').getTime() - Date.now()) / 86400000));
  }

  /** Four shop items included with Pro each month (deterministic rotation). */
  monthlyProSelection(): Item[] {
    const d = new Date();
    const seed = d.getFullYear() * 12 + d.getMonth();
    const pool = ITEMS.filter((i) => i.price > 0 && !i.pro && i.rarity !== 'legendaire' && i.slot !== 'background');
    const out: Item[] = [];
    let x = seed * 9301 + 49297;
    while (out.length < 4 && out.length < pool.length) {
      x = (x * 9301 + 49297) % 233280;
      const pick = pool[Math.floor((x / 233280) * pool.length)];
      if (!out.includes(pick)) out.push(pick);
    }
    return out;
  }

  // ------------------------------------------------------------ ownership
  owns(id: string): boolean {
    const i = item(id);
    if (!i) return false;
    if (this.state.inventory.includes(id)) return true;
    if (i.pro) return this.isPro;
    if (i.price === 0 && !this.notYetAvailable(i)) return true;
    if (this.isPro && this.monthlyProSelection().some((m) => m.id === id)) return true;
    return false;
  }

  notYetAvailable(i: Item): boolean {
    return !!i.from && i.from > today();
  }

  expired(i: Item): boolean {
    return !!i.until && i.until < today();
  }

  /** Why the item cannot be bought right now, or null if it can. */
  purchaseBlock(i: Item): string | null {
    if (this.owns(i.id)) return 'Déjà possédé';
    if (i.pro) return 'Réservé aux membres Pro';
    if (this.expired(i)) return 'Édition limitée terminée';
    if (this.notYetAvailable(i) && !this.isPro) return `Disponible le ${formatDate(i.from!)} - accès anticipé Pro`;
    if (this.state.coins < i.price) return 'Éclats insuffisants';
    return null;
  }

  buy(id: string): boolean {
    const i = item(id);
    if (!i || this.purchaseBlock(i)) return false;
    this.update((s) => {
      s.coins -= i.price;
      s.inventory.push(id);
    });
    return true;
  }

  // ------------------------------------------------------------ economy
  canClaimDaily(): boolean {
    return this.state.lastDaily !== today();
  }

  dailyAmount(): number {
    return this.isPro ? 150 : 50;
  }

  claimDaily(): number {
    if (!this.canClaimDaily()) return 0;
    const n = this.dailyAmount();
    this.update((s) => {
      s.coins += n;
      s.lastDaily = today();
    });
    return n;
  }

  track(stat: keyof Omit<DayStats, 'day' | 'claimed'>, amount = 1): void {
    this.update((s) => {
      s.day[stat] += amount;
    });
  }

  missionProgress(id: string): { value: number; done: boolean; claimed: boolean } {
    const m = DAILY_MISSIONS.find((x) => x.id === id)!;
    const value = Math.min(m.goal, Math.floor(this.state.day[m.stat]));
    return { value, done: value >= m.goal, claimed: this.state.day.claimed.includes(id) };
  }

  claimMission(id: string): number {
    const m = DAILY_MISSIONS.find((x) => x.id === id);
    if (!m) return 0;
    const p = this.missionProgress(id);
    if (!p.done || p.claimed) return 0;
    this.update((s) => {
      s.coins += m.reward;
      s.day.claimed.push(id);
    });
    return m.reward;
  }

  collectionProgress(cid: string): { owned: number; total: number; items: Item[] } {
    const items = ITEMS.filter((i) => i.collection === cid);
    return { owned: items.filter((i) => this.state.inventory.includes(i.id) || this.owns(i.id)).length, total: items.length, items };
  }

  claimCollection(cid: string): number {
    const c = COLLECTIONS.find((x) => x.id === cid);
    if (!c || this.state.claimedCollections.includes(cid)) return 0;
    const p = this.collectionProgress(cid);
    if (p.owned < p.total) return 0;
    this.update((s) => {
      s.coins += c.reward;
      s.claimedCollections.push(cid);
      s.title = c.rewardTitle;
    });
    return c.reward;
  }

  hasUnreadNews(): boolean {
    return this.state.lastSeenNews !== APP_VERSION;
  }
}

export function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const months = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
  return `${d} ${months[m - 1]} ${y}`;
}

export function daysUntil(iso: string): number {
  return Math.ceil((new Date(iso + 'T23:59:59').getTime() - Date.now()) / 86400000);
}

export const store = new Store();
