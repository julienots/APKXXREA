/**
 * Default project choices + screen classification (shared by the server and the on-device engine).
 * Flags screens that cannot work on their own once rebuilt: loading/download/splash screens (their original
 * code moves on to the next screen) and screens that belong to embedded libraries.
 */
import { colorsOf, type Loaded } from './analysis-core.js';
import { listLayouts, layoutTree, screenGraph, type UiNode } from './ui.js';
import { defaultOptions, type ProjectOptions, type StoredScreen } from './rebuild-core.js';

export interface Candidate {
  key: string;
  origin: string;
  usedBy: string[];
  library: boolean;
  loading: boolean;
  hint?: string;
}

const LIB_CLASS = /^(android|androidx|kotlin|kotlinx|java|javax|com\.google|com\.android|com\.facebook|com\.unity3d|com\.applovin|com\.ironsource|io\.flutter|com\.squareup|org\.apache|com\.bumptech)\./;
const LIB_LAYOUT = /^(abc_|mtrl_|material_|design_|m3_|notification_|select_dialog|support_simple|browser_actions|exo_|ime_|preference|com_facebook|common_google|fcm|test_|lb_|custom_dialog$)/;
const LOADING_NAME = /(splash|loading|loader|download|launch|startup|boot|obb|expansion|progress)/i;
const LOADING_TEXT = /(download|télécharg|telecharg|loading|chargement|pause|resume|reprendre|wi-?fi|cellular|veuillez patienter|please wait|unpacking|extract)/i;

function walk(n: UiNode, f: (n: UiNode) => void) {
  f(n);
  n.children.forEach((c) => walk(c, f));
}

export function classifyScreen(L: Loaded, key: string, usedBy: string[], root?: UiNode | null): Pick<Candidate, 'library' | 'loading' | 'hint'> {
  const own = (L.analysis.package ?? '').split('.').slice(0, 2).join('.');
  const library = usedBy.length > 0 ? usedBy.every((c) => !(own && c.startsWith(own + '.')) && LIB_CLASS.test(c)) : LIB_LAYOUT.test(key);
  let progress = false, inputs = false, textHit = false;
  if (root) {
    walk(root, (n) => {
      if (n.kind === 'progress') progress = true;
      if (n.kind === 'edit' || n.kind === 'list') inputs = true;
      const t = `${n.props.text ?? ''} ${n.viewId ?? ''}`;
      if (LOADING_TEXT.test(t)) textHit = true;
    });
  }
  const nameHit = LOADING_NAME.test(key) || usedBy.some((c) => LOADING_NAME.test(c.split('.').pop() ?? ''));
  const loading = (progress && !inputs && (textHit || nameHit)) || (/splash/i.test(key) || usedBy.some((c) => /splash/i.test(c)));
  const hint = loading
    ? "Écran de chargement / téléchargement : dans l'app d'origine, du code passe ensuite à un autre écran. Reconstruit seul, il resterait affiché indéfiniment — réglez « écran suivant »."
    : library
      ? "Écran fourni par une bibliothèque intégrée (pas une interface propre à l'application)."
      : undefined;
  return { library, loading, hint };
}

export async function projectDefaults(L: Loaded | undefined, stored: StoredScreen[]) {
  const o: ProjectOptions = defaultOptions(L);
  const warnings: string[] = [];
  let candidates: Candidate[] = [];
  let launcherLayout: string | undefined;
  if (L) {
    const g = screenGraph(L);
    launcherLayout = g.screens.find((s) => s.launcher)?.layouts[0];
    const layouts = listLayouts(L);
    const usedByOf = (k: string) => layouts.find((l) => l.name === k)?.usedBy ?? [];
    for (const s of stored) candidates.push({ key: s.key, origin: s.origin, usedBy: usedByOf(s.key), ...classifyScreen(L, s.key, usedByOf(s.key), s.root) });
    for (const l of layouts) {
      if (stored.some((s) => s.key === l.name)) continue;
      const tree = l.usedBy.length || LOADING_NAME.test(l.name) ? (await layoutTree(L, l.name).catch(() => null))?.root : null;
      candidates.push({ key: l.name, origin: 'original', usedBy: l.usedBy, ...classifyScreen(L, l.name, l.usedBy, tree) });
    }
    const used = new Set(g.screens.flatMap((s) => s.layouts));
    const selected = candidates.filter((c) => (used.has(c.key) || c.origin !== 'original') && !c.library).slice(0, 20);
    o.screens = selected.map((c) => ({ key: c.key, launcher: c.key === launcherLayout }));
    const launcher = candidates.find((c) => c.key === launcherLayout);
    const next = selected.find((c) => c.key !== launcherLayout && !c.loading);
    if (launcher?.loading) {
      if (next) {
        const spec = o.screens.find((s) => s.key === launcher.key);
        if (spec) Object.assign(spec, { next: next.key, delay: 2 });
        warnings.push(`L'écran de lancement d'origine « ${launcher.key} » est un écran de chargement : il enchaînera automatiquement sur « ${next.key} » après 2 s (modifiable).`);
      } else {
        warnings.push(
          `L'écran de lancement d'origine « ${launcher.key} » est un écran de chargement/téléchargement de données, et aucun autre écran XML propre à l'application n'a été trouvé. L'interface réelle est donc construite par le code (moteur de jeu, Compose, vues dessinées…) et n'est pas récupérable telle quelle. Créez vos écrans avec la reconstruction assistée (UI Reconstructor), puis choisissez-les ici comme écran suivant ou de lancement.`,
        );
      }
    }
    if (g.dynamicUi.length) warnings.push(...g.dynamicUi);
    const colors = colorsOf(L.resolver).filter((c) => !c.config);
    const pick = (re: RegExp) => colors.find((c) => re.test(c.name))?.value.toUpperCase();
    o.colors.primary = pick(/^(color_?)?primary$/i) ?? o.colors.primary;
    o.colors.primaryDark = pick(/^(color_?)?primary_?(dark|variant)$/i) ?? o.colors.primaryDark;
    o.colors.accent = pick(/^(color_?)?(accent|secondary)$/i) ?? o.colors.accent;
  }
  return { options: o, candidates, features: L?.analysis.features ?? [], launcherLayout, warnings };
}
