import { useState } from 'react';
import { api, getToken, SystemInfo, TOKEN_KEY, isLocal, android } from '../lib/api';
import { bytes, useAsync } from '../lib/util';
import { Badge, Card, ErrorBox, KV, Loading, PageHeader, Notice } from '../components/ui';
import { ITrash } from '../components/icons';

export default function Settings() {
  const sys = useAsync(() => api<SystemInfo>('/system?refresh=1'), []);
  const [token, setToken] = useState(getToken());
  const [msg, setMsg] = useState<string>();
  const s = sys.data;
  const ok = (v: unknown, label?: string) => (v ? <Badge tone="good">{label ?? (typeof v === 'string' ? v : 'disponible')}</Badge> : <Badge tone="bad">absent</Badge>);
  const saveSettings = async (patch: Partial<SystemInfo['settings']>) => {
    await api('/settings', { method: 'PUT', json: patch });
    sys.reload();
  };
  const wipe = async () => {
    const c = prompt('Cette action supprime TOUTES les analyses, APK importés, projets et compilations. Tapez SUPPRIMER pour confirmer.');
    if (c !== 'SUPPRIMER') return;
    await api('/data?confirm=DELETE', { method: 'DELETE' });
    setMsg('Toutes les données ont été supprimées.');
    sys.reload();
  };
  return (
    <>
      <PageHeader kicker="Paramètres" title="Environnement & sécurité" />
      <ErrorBox error={sys.error} />
      {!s && !sys.error && <Loading />}
      {s && (
        <div className="grid gap-4 xl:grid-cols-2">
          {s.mode === 'device' && (
            <Card title="Mode téléphone (sans serveur)" className="xl:col-span-2">
              <p className="text-sm text-ink-200">Analyse, exploration (désassemblage natif), reconstruction UI, génération de projet et compilation d'APK s'exécutent sur ce téléphone. Les APK produits sont signés avec une clé générée et conservée sur l'appareil.</p>
              <p className="mt-2 text-sm text-ink-400">Non disponible sur téléphone : décompilation Java (JADX), smali (Apktool), compilation de code Java modifié à la main. Pour cela, connectez un serveur APPXRAY (ordinateur).</p>
              {android()?.changeServer && <button className="btn-ghost mt-3" onClick={() => android()!.changeServer!()}>Utiliser un serveur APPXRAY…</button>}
            </Card>
          )}
          {s.mode !== 'device' && <>
          <Card title="Moteurs d'analyse">
            <KV
              items={[
                ['Java', ok(s.tools.java)],
                ['JADX', ok(s.tools.jadx)],
                ['Apktool', ok(s.tools.apktool)],
                ['AAPT2', ok(s.tools.aapt2)],
                ['Ressources framework', ok(s.tools.frameworkRes)],
              ]}
            />
            <p className="mt-3 text-xs text-ink-400">Installation / mise à jour : <code className="mono">npm run setup:tools</code></p>
          </Card>
          <Card title="Compilation">
            <KV
              items={[
                ['Mode lite', s.buildModes.lite ? <Badge tone="good">opérationnel</Badge> : <Badge tone="bad">{s.buildModes.reasons.lite}</Badge>],
                ['Mode Gradle', s.buildModes.gradle ? <Badge tone="good">opérationnel</Badge> : <Badge tone="warn">{s.buildModes.reasons.gradle}</Badge>],
                ['javac / dx', <>{ok(s.tools.javac, 'javac')} {ok(s.tools.dx, 'dx')} {ok(s.tools.androidStubs, 'android stubs')}</>],
                ['Signature', <>{ok(s.tools.keytool, 'keytool')} {ok(s.tools.jarsigner, 'jarsigner')}</>],
                ['Android SDK', s.tools.androidSdk ? <span className="mono text-xs">{s.tools.androidSdk.path} ({s.tools.androidSdk.platforms.join(', ')})</span> : <Badge tone="warn">non installé</Badge>],
                ['Gradle', ok(s.tools.gradle)],
              ]}
            />
            {!s.buildModes.gradle && <p className="mt-3 text-xs text-ink-400">Pour activer Gradle : installez l'Android SDK (platforms;android-35, build-tools;35.0.0) et définissez ANDROID_HOME, ou utilisez l'image <code className="mono">Dockerfile</code> fournie.</p>}
          </Card>
          <Card title="Isolation des traitements">
            <KV
              items={[
                ['Réseau coupé (namespace)', s.tools.sandbox.netns ? <Badge tone="good">actif</Badge> : <Badge tone="warn">indisponible sur cet hôte</Badge>],
                ['Limites (prlimit)', s.tools.sandbox.prlimit ? <Badge tone="good">actif</Badge> : <Badge tone="warn">indisponible</Badge>],
                ['Durée max par outil', `${Math.round((s.limits.toolTimeoutMs ?? 0) / 1000)} s`],
                ['Mémoire JVM', `${s.limits.toolMemoryMb} Mo`],
                ['Taille max APK', bytes(s.limits.maxUploadBytes)],
                ['Entrées ZIP max', s.limits.maxEntries?.toLocaleString('fr-FR')],
                ['Ratio de compression max', `${s.limits.maxCompressionRatio}:1`],
              ]}
            />
            <p className="mt-3 text-xs text-ink-400">Les APK importés ne sont jamais exécutés ni installés. JADX, Apktool et la chaîne lite tournent sans réseau. Le mode Gradle a besoin du réseau pour les dépôts Maven.</p>
          </Card>
          </>}
          {!isLocal() && <Card title="Préférences">
            <label className="flex items-center gap-3 text-sm">
              <input type="checkbox" className="h-4 w-4 accent-volt-500" checked={s.settings.autoDecompile} onChange={(e) => saveSettings({ autoDecompile: e.target.checked })} />
              Décompiler automatiquement (JADX + Apktool) après l'import
            </label>
            <label className="mt-3 block text-sm">
              <span className="label">Threads JADX</span>
              <input className="input !w-28" type="number" min={1} max={16} value={s.settings.jadxThreads} onChange={(e) => saveSettings({ jadxThreads: +e.target.value })} />
            </label>
            <div className="mt-4">
              <span className="label">Jeton d'accès (si APPXRAY_TOKEN est défini côté serveur)</span>
              <div className="flex gap-2">
                <input className="input mono" type="password" value={token} onChange={(e) => setToken(e.target.value)} placeholder={s.authRequired ? 'requis' : 'non requis'} />
                <button className="btn-ghost" onClick={() => { try { localStorage.setItem(TOKEN_KEY, token); } catch { /* ignore */ } setMsg('Jeton enregistré sur cet appareil'); }}>Enregistrer</button>
              </div>
            </div>
          </Card>}
          {'AppxrayAndroid' in window && !isLocal() && (
            <Card title="Application Android" className="xl:col-span-2">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <div className="flex-1 text-sm">Cette application est connectée au serveur APPXRAY <span className="mono text-cyan-x">{location.origin}</span>.</div>
                <button className="btn-ghost" onClick={() => android()?.changeServer?.()}>Changer de serveur</button>
                {android()?.useLocal && <button className="btn-ghost" onClick={() => android()!.useLocal!()}>Revenir au mode téléphone</button>}
              </div>
            </Card>
          )}
          <Card title="Stockage & suppression" className="xl:col-span-2">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="flex-1 text-sm">Espace utilisé : <strong>{bytes(s.storage.bytes)}</strong> ({s.storage.files.toLocaleString('fr-FR')} fichiers). Chaque analyse ou projet peut aussi être supprimé individuellement.</div>
              <button className="btn-danger" onClick={wipe}><ITrash /> Tout supprimer</button>
            </div>
            {msg && <div className="mt-3"><Notice tone="good">{msg}</Notice></div>}
          </Card>
        </div>
      )}
    </>
  );
}
