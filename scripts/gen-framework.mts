/**
 * Extracts a compact JSON of Android framework resources (from Apktool's android-framework.jar) for the
 * on-device engine: names of every android:* resource, attr enum/flag symbols, and simple values (colors…).
 * Output: web/public/framework.json  —  run with: npx tsx scripts/gen-framework.mts
 */
import fs from 'node:fs';
import path from 'node:path';
import { readEntry } from '../server/src/engines/zip.ts';
import { parseResTable, VT } from '../server/src/engines/res.ts';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const buf = await readEntry(path.join(root, 'tools/aapt2/android-framework.jar'), 'resources.arsc');
if (!buf) throw new Error('android-framework.jar introuvable: lancez npm run setup:tools');
const t = parseResTable(buf);
const types: string[] = [];
const rows: unknown[] = [];
for (const e of t.entries.values()) {
  let ti = types.indexOf(e.type);
  if (ti < 0) ti = types.push(e.type) - 1;
  const def = e.values.find((v) => v.config === '') ?? e.values[0];
  const row: unknown[] = [e.id >>> 0, ti, e.name];
  if (e.type === 'attr' && def?.bag) row.push(def.bag.items.map((i) => [i.name >>> 0, i.value.data >>> 0]));
  else if (def?.value && (e.type === 'color' || e.type === 'dimen' || e.type === 'bool' || e.type === 'integer') && def.value.type !== VT.STRING) row.push([def.value.type, def.value.data >>> 0]);
  rows.push(row);
}
const out = path.join(root, 'web/public/framework.json');
fs.writeFileSync(out, JSON.stringify({ v: 1, types, rows }));
console.log(`framework.json: ${rows.length} ressources, ${(fs.statSync(out).size / 1024).toFixed(0)} Ko`);
const id = (type: string, name: string) => '0x' + ([...t.entries.values()].find((e) => e.type === type && e.name === name)!.id >>> 0).toString(16);
for (const n of ['theme', 'label', 'icon', 'name', 'exported', 'versionCode', 'versionName', 'minSdkVersion', 'targetSdkVersion', 'allowBackup', 'usesCleartextTraffic', 'maxSdkVersion', 'configChanges', 'supportsRtl']) console.log(n, id('attr', n));
console.log('Theme.Material.Light.DarkActionBar', id('style', 'Theme.Material.Light.DarkActionBar'));
