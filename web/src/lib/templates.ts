/** Assisted-reconstruction templates: starting points for screens whose UI cannot be recovered from the APK. */
import type { UiNode, UiProps } from './api';

let n = 0;
const uid = () => `t${Date.now().toString(36)}${n++}`;
export const node = (kind: string, tag: string, props: UiProps = {}, children: UiNode[] = [], viewId?: string): UiNode => ({ uid: uid(), kind, tag, props, raw: {}, children, viewId });

export const PALETTE: { kind: string; tag: string; label: string; make: () => UiNode }[] = [
  { kind: 'text', tag: 'TextView', label: 'Texte', make: () => node('text', 'TextView', { width: 'wrap', height: 'wrap', text: 'Nouveau texte', textSize: 16 }) },
  { kind: 'button', tag: 'Button', label: 'Bouton', make: () => node('button', 'Button', { width: 'match', height: 'wrap', text: 'Action', margin: [0, 8, 0, 8] }) },
  { kind: 'edit', tag: 'EditText', label: 'Champ', make: () => node('edit', 'EditText', { width: 'match', height: 'wrap', hint: 'Saisir…' }) },
  { kind: 'image', tag: 'ImageView', label: 'Image', make: () => node('image', 'ImageView', { width: '96dp', height: '96dp' }) },
  { kind: 'check', tag: 'CheckBox', label: 'Case', make: () => node('check', 'CheckBox', { width: 'wrap', height: 'wrap', text: 'Option' }) },
  { kind: 'switch', tag: 'Switch', label: 'Interrupteur', make: () => node('switch', 'Switch', { width: 'match', height: 'wrap', text: 'Réglage' }) },
  { kind: 'linear', tag: 'LinearLayout', label: 'Colonne', make: () => node('linear', 'LinearLayout', { width: 'match', height: 'wrap', orientation: 'vertical', padding: [8, 8, 8, 8] }) },
  { kind: 'linear', tag: 'LinearLayout', label: 'Rangée', make: () => node('linear', 'LinearLayout', { width: 'match', height: 'wrap', orientation: 'horizontal', gravity: 'center_vertical' }) },
  { kind: 'card', tag: 'FrameLayout', label: 'Carte', make: () => node('card', 'FrameLayout', { width: 'match', height: 'wrap', padding: [16, 16, 16, 16], margin: [0, 8, 0, 8], background: { color: '#FFFFFFFF', radius: 12 } }) },
  { kind: 'list', tag: 'ListView', label: 'Liste', make: () => node('list', 'ListView', { width: 'match', height: '0dp', weight: 1 }) },
  { kind: 'progress', tag: 'ProgressBar', label: 'Progression', make: () => node('progress', 'ProgressBar', { width: 'wrap', height: 'wrap' }) },
  { kind: 'view', tag: 'View', label: 'Séparateur', make: () => node('view', 'View', { width: 'match', height: '1dp', background: { color: '#1F000000' }, margin: [0, 8, 0, 8] }) },
];

const col = (children: UiNode[], props: UiProps = {}) => node('linear', 'LinearLayout', { width: 'match', height: 'match', orientation: 'vertical', padding: [24, 24, 24, 24], ...props }, children);
const title = (t: string) => node('text', 'TextView', { width: 'wrap', height: 'wrap', text: t, textSize: 26, textStyle: 'bold', margin: [0, 0, 0, 16] });

export const TEMPLATES: Record<string, { label: string; desc: string; make: (primary?: string) => UiNode }> = {
  blank: { label: 'Écran vide', desc: 'Colonne vide à composer', make: () => col([title('Titre')]) },
  login: {
    label: 'Connexion',
    desc: 'E-mail, mot de passe, bouton',
    make: (p) =>
      col(
        [
          title('Connexion'),
          node('edit', 'EditText', { width: 'match', height: 'wrap', hint: 'Adresse e-mail', inputType: 'textEmailAddress' }, [], 'email'),
          node('edit', 'EditText', { width: 'match', height: 'wrap', hint: 'Mot de passe', inputType: 'textPassword' }, [], 'password'),
          node('button', 'Button', { width: 'match', height: 'wrap', text: 'Se connecter', margin: [0, 16, 0, 0], background: { color: p ?? '#FF2F6BFF', radius: 8 }, textColor: '#FFFFFFFF' }, [], 'submit'),
        ],
        { gravity: 'center_vertical' },
      ),
  },
  list: {
    label: 'Liste',
    desc: 'Barre de titre + liste',
    make: (p) =>
      node('linear', 'LinearLayout', { width: 'match', height: 'match', orientation: 'vertical' }, [
        node('toolbar', 'LinearLayout', { width: 'match', height: '56dp', padding: [16, 0, 16, 0], background: { color: p ?? '#FF2F6BFF' }, gravity: 'center_vertical' }, [node('text', 'TextView', { width: 'wrap', height: 'wrap', text: 'Éléments', textColor: '#FFFFFFFF', textSize: 20 })]),
        node('list', 'ListView', { width: 'match', height: '0dp', weight: 1 }, [], 'list'),
      ]),
  },
  detail: {
    label: 'Détail',
    desc: 'Image, titre, description, action',
    make: (p) =>
      node('scroll', 'ScrollView', { width: 'match', height: 'match' }, [
        node('linear', 'LinearLayout', { width: 'match', height: 'wrap', orientation: 'vertical' }, [
          node('image', 'ImageView', { width: 'match', height: '200dp', background: { color: '#FFE2E8F0' } }, [], 'cover'),
          node('linear', 'LinearLayout', { width: 'match', height: 'wrap', orientation: 'vertical', padding: [16, 16, 16, 16] }, [
            node('text', 'TextView', { width: 'match', height: 'wrap', text: 'Titre de l’élément', textSize: 22, textStyle: 'bold' }),
            node('text', 'TextView', { width: 'match', height: 'wrap', text: 'Description détaillée…', textSize: 15, margin: [0, 8, 0, 16], textColor: '#FF475569' }),
            node('button', 'Button', { width: 'match', height: 'wrap', text: 'Action principale', background: { color: p ?? '#FF2F6BFF', radius: 8 }, textColor: '#FFFFFFFF' }, [], 'action'),
          ]),
        ]),
      ]),
  },
  form: {
    label: 'Formulaire',
    desc: 'Champs + options + validation',
    make: (p) =>
      col([
        title('Formulaire'),
        node('edit', 'EditText', { width: 'match', height: 'wrap', hint: 'Nom' }, [], 'name'),
        node('edit', 'EditText', { width: 'match', height: 'wrap', hint: 'Téléphone', inputType: 'phone' }, [], 'phone'),
        node('check', 'CheckBox', { width: 'wrap', height: 'wrap', text: 'J’accepte les conditions' }, [], 'terms'),
        node('button', 'Button', { width: 'match', height: 'wrap', text: 'Envoyer', margin: [0, 16, 0, 0], background: { color: p ?? '#FF2F6BFF', radius: 8 }, textColor: '#FFFFFFFF' }, [], 'send'),
      ]),
  },
  settings: {
    label: 'Réglages',
    desc: 'Liste d’interrupteurs',
    make: () => col([title('Réglages'), node('switch', 'Switch', { width: 'match', height: 'wrap', text: 'Notifications', padding: [0, 12, 0, 12] }, [], 'notif'), node('switch', 'Switch', { width: 'match', height: 'wrap', text: 'Mode sombre', padding: [0, 12, 0, 12] }, [], 'dark')], { padding: [16, 16, 16, 16] }),
  },
};

// ───── tree helpers ─────
export function findNode(root: UiNode, id: string): UiNode | undefined {
  if (root.uid === id) return root;
  for (const c of root.children) {
    const f = findNode(c, id);
    if (f) return f;
  }
  return undefined;
}
export function findParent(root: UiNode, id: string): UiNode | undefined {
  for (const c of root.children) {
    if (c.uid === id) return root;
    const f = findParent(c, id);
    if (f) return f;
  }
  return undefined;
}
export function mapTree(root: UiNode, id: string, fn: (n: UiNode) => UiNode): UiNode {
  if (root.uid === id) return fn(root);
  return { ...root, children: root.children.map((c) => mapTree(c, id, fn)) };
}
export function removeNode(root: UiNode, id: string): UiNode {
  return { ...root, children: root.children.filter((c) => c.uid !== id).map((c) => removeNode(c, id)) };
}
export function moveNode(root: UiNode, id: string, dir: -1 | 1): UiNode {
  const parent = findParent(root, id);
  if (!parent) return root;
  return mapTree(root, parent.uid, (p) => {
    const i = p.children.findIndex((c) => c.uid === id);
    const j = i + dir;
    if (j < 0 || j >= p.children.length) return p;
    const kids = [...p.children];
    [kids[i], kids[j]] = [kids[j], kids[i]];
    return { ...p, children: kids };
  });
}
export function cloneWithNewIds(n: UiNode): UiNode {
  return { ...n, uid: uid(), props: JSON.parse(JSON.stringify(n.props)), children: n.children.map(cloneWithNewIds) };
}
export function countNodes(n: UiNode): number {
  return 1 + n.children.reduce((s, c) => s + countNodes(c), 0);
}
