/**
 * Heuristic detection of frameworks, libraries, obfuscation and app features.
 * Every finding carries its evidence so the UI can show *why* it was detected.
 */

export interface Evidence { kind: 'class' | 'file' | 'permission' | 'string' | 'native' | 'manifest'; value: string }
export interface Detection { id: string; name: string; category: string; confidence: number; evidence: Evidence[] }

export interface DetectInput {
  files: string[];
  classNames: string[]; // java names
  permissions: string[];
  strings: string[]; // a sample of DEX strings
  manifestComponents: string[];
  metaData: string[];
}

interface LibRule { id: string; name: string; category: string; pkgs?: string[]; files?: RegExp[]; natives?: RegExp[] }

const LIBS: LibRule[] = [
  // frameworks
  { id: 'flutter', name: 'Flutter', category: 'Framework', pkgs: ['io.flutter.'], natives: [/libflutter\.so$/, /libapp\.so$/], files: [/flutter_assets\//] },
  { id: 'react-native', name: 'React Native', category: 'Framework', pkgs: ['com.facebook.react.'], natives: [/libreactnativejni\.so$/, /libhermes\.so$/], files: [/index\.android\.bundle$/] },
  { id: 'unity', name: 'Unity', category: 'Framework', pkgs: ['com.unity3d.player.'], natives: [/libunity\.so$/, /libil2cpp\.so$/], files: [/assets\/bin\/Data\//] },
  { id: 'xamarin', name: 'Xamarin / .NET MAUI', category: 'Framework', pkgs: ['mono.android.', 'crc64'], natives: [/libmonodroid\.so$/, /libmonosgen/], files: [/assemblies\/.*\.dll$/] },
  { id: 'cordova', name: 'Apache Cordova', category: 'Framework', pkgs: ['org.apache.cordova.'], files: [/assets\/www\/cordova\.js$/] },
  { id: 'capacitor', name: 'Capacitor (Ionic)', category: 'Framework', pkgs: ['com.getcapacitor.'], files: [/assets\/public\/index\.html$/] },
  { id: 'kotlin', name: 'Kotlin', category: 'Langage', pkgs: ['kotlin.'], files: [/^kotlin\//, /\.kotlin_module$/] },
  { id: 'compose', name: 'Jetpack Compose', category: 'UI', pkgs: ['androidx.compose.'] },
  { id: 'godot', name: 'Godot Engine', category: 'Framework', pkgs: ['org.godotengine.'], natives: [/libgodot_android\.so$/] },
  { id: 'cocos', name: 'Cocos2d-x', category: 'Framework', pkgs: ['org.cocos2dx.'], natives: [/libcocos2d/] },
  { id: 'qt', name: 'Qt for Android', category: 'Framework', pkgs: ['org.qtproject.'], natives: [/libQt\d/] },
  // androidx & ui
  { id: 'appcompat', name: 'AndroidX AppCompat', category: 'UI', pkgs: ['androidx.appcompat.'] },
  { id: 'material', name: 'Material Components', category: 'UI', pkgs: ['com.google.android.material.'] },
  { id: 'constraintlayout', name: 'ConstraintLayout', category: 'UI', pkgs: ['androidx.constraintlayout.'] },
  { id: 'recyclerview', name: 'RecyclerView', category: 'UI', pkgs: ['androidx.recyclerview.'] },
  { id: 'navigation', name: 'Jetpack Navigation', category: 'Architecture', pkgs: ['androidx.navigation.'] },
  { id: 'lifecycle', name: 'Jetpack Lifecycle / ViewModel', category: 'Architecture', pkgs: ['androidx.lifecycle.'] },
  { id: 'room', name: 'Room', category: 'Données', pkgs: ['androidx.room.'] },
  { id: 'workmanager', name: 'WorkManager', category: 'Architecture', pkgs: ['androidx.work.'] },
  { id: 'datastore', name: 'DataStore', category: 'Données', pkgs: ['androidx.datastore.'] },
  { id: 'camerax', name: 'CameraX', category: 'Média', pkgs: ['androidx.camera.'] },
  { id: 'media3', name: 'Media3 / ExoPlayer', category: 'Média', pkgs: ['androidx.media3.', 'com.google.android.exoplayer2.'] },
  // network
  { id: 'okhttp', name: 'OkHttp', category: 'Réseau', pkgs: ['okhttp3.', 'com.squareup.okhttp.'] },
  { id: 'retrofit', name: 'Retrofit', category: 'Réseau', pkgs: ['retrofit2.'] },
  { id: 'volley', name: 'Volley', category: 'Réseau', pkgs: ['com.android.volley.'] },
  { id: 'ktor', name: 'Ktor client', category: 'Réseau', pkgs: ['io.ktor.'] },
  { id: 'grpc', name: 'gRPC', category: 'Réseau', pkgs: ['io.grpc.'] },
  // serialization
  { id: 'gson', name: 'Gson', category: 'Sérialisation', pkgs: ['com.google.gson.'] },
  { id: 'moshi', name: 'Moshi', category: 'Sérialisation', pkgs: ['com.squareup.moshi.'] },
  { id: 'jackson', name: 'Jackson', category: 'Sérialisation', pkgs: ['com.fasterxml.jackson.'] },
  { id: 'kotlinx-serialization', name: 'kotlinx.serialization', category: 'Sérialisation', pkgs: ['kotlinx.serialization.'] },
  { id: 'protobuf', name: 'Protocol Buffers', category: 'Sérialisation', pkgs: ['com.google.protobuf.'] },
  // async / DI
  { id: 'coroutines', name: 'Kotlin Coroutines', category: 'Concurrence', pkgs: ['kotlinx.coroutines.'] },
  { id: 'rxjava', name: 'RxJava', category: 'Concurrence', pkgs: ['io.reactivex.', 'rx.'] },
  { id: 'dagger', name: 'Dagger / Hilt', category: 'Injection', pkgs: ['dagger.', 'dagger.hilt.'] },
  { id: 'koin', name: 'Koin', category: 'Injection', pkgs: ['org.koin.'] },
  // images
  { id: 'glide', name: 'Glide', category: 'Images', pkgs: ['com.bumptech.glide.'] },
  { id: 'picasso', name: 'Picasso', category: 'Images', pkgs: ['com.squareup.picasso.'] },
  { id: 'coil', name: 'Coil', category: 'Images', pkgs: ['coil.', 'coil3.'] },
  { id: 'fresco', name: 'Fresco', category: 'Images', pkgs: ['com.facebook.fresco.', 'com.facebook.imagepipeline.'] },
  { id: 'lottie', name: 'Lottie', category: 'Images', pkgs: ['com.airbnb.lottie.'] },
  // google / firebase
  { id: 'gms', name: 'Google Play Services', category: 'Google', pkgs: ['com.google.android.gms.common.'] },
  { id: 'firebase-messaging', name: 'Firebase Cloud Messaging', category: 'Firebase', pkgs: ['com.google.firebase.messaging.'] },
  { id: 'firebase-analytics', name: 'Firebase Analytics', category: 'Firebase', pkgs: ['com.google.firebase.analytics.', 'com.google.android.gms.measurement.'] },
  { id: 'firebase-crashlytics', name: 'Firebase Crashlytics', category: 'Firebase', pkgs: ['com.google.firebase.crashlytics.'] },
  { id: 'firebase-auth', name: 'Firebase Auth', category: 'Firebase', pkgs: ['com.google.firebase.auth.'] },
  { id: 'firestore', name: 'Cloud Firestore', category: 'Firebase', pkgs: ['com.google.firebase.firestore.'] },
  { id: 'firebase-db', name: 'Firebase Realtime Database', category: 'Firebase', pkgs: ['com.google.firebase.database.'] },
  { id: 'maps', name: 'Google Maps SDK', category: 'Google', pkgs: ['com.google.android.gms.maps.'] },
  { id: 'billing', name: 'Google Play Billing', category: 'Paiement', pkgs: ['com.android.billingclient.'] },
  { id: 'admob', name: 'Google Mobile Ads (AdMob)', category: 'Publicité', pkgs: ['com.google.android.gms.ads.'] },
  { id: 'mlkit', name: 'ML Kit', category: 'Google', pkgs: ['com.google.mlkit.'] },
  // third parties
  { id: 'facebook-sdk', name: 'Facebook SDK', category: 'Social', pkgs: ['com.facebook.login.', 'com.facebook.share.', 'com.facebook.appevents.'] },
  { id: 'stripe', name: 'Stripe', category: 'Paiement', pkgs: ['com.stripe.android.'] },
  { id: 'onesignal', name: 'OneSignal', category: 'Notifications', pkgs: ['com.onesignal.'] },
  { id: 'sentry', name: 'Sentry', category: 'Monitoring', pkgs: ['io.sentry.'] },
  { id: 'appsflyer', name: 'AppsFlyer', category: 'Analytics', pkgs: ['com.appsflyer.'] },
  { id: 'adjust', name: 'Adjust', category: 'Analytics', pkgs: ['com.adjust.sdk.'] },
  { id: 'mixpanel', name: 'Mixpanel', category: 'Analytics', pkgs: ['com.mixpanel.'] },
  { id: 'realm', name: 'Realm', category: 'Données', pkgs: ['io.realm.'], natives: [/librealm/] },
  { id: 'sqlcipher', name: 'SQLCipher', category: 'Données', pkgs: ['net.sqlcipher.', 'net.zetetic.'], natives: [/libsqlcipher\.so$/] },
  { id: 'timber', name: 'Timber', category: 'Utilitaire', pkgs: ['timber.log.'] },
  { id: 'eventbus', name: 'EventBus', category: 'Utilitaire', pkgs: ['org.greenrobot.eventbus.'] },
  { id: 'zxing', name: 'ZXing (QR/codes-barres)', category: 'Média', pkgs: ['com.google.zxing.', 'com.journeyapps.barcodescanner.'] },
  { id: 'unity-ads', name: 'Unity Ads', category: 'Publicité', pkgs: ['com.unity3d.ads.', 'com.unity3d.services.'] },
  { id: 'applovin', name: 'AppLovin', category: 'Publicité', pkgs: ['com.applovin.'] },
  { id: 'ironsource', name: 'ironSource', category: 'Publicité', pkgs: ['com.ironsource.'] },
  // protection
  { id: 'dexguard', name: 'DexGuard (indices)', category: 'Protection', pkgs: ['com.guardsquare.'] },
  { id: 'jiagu', name: 'Packer chinois (Jiagu/Bangcle/…)', category: 'Protection', natives: [/libjiagu/, /libsecexe\.so$/, /libDexHelper\.so$/, /libshell/, /libprotectClass/], files: [/assets\/ijiami/, /assets\/secData/] },
];

export function detectLibraries(inp: DetectInput): Detection[] {
  const out: Detection[] = [];
  const natives = inp.files.filter((f) => f.startsWith('lib/') && f.endsWith('.so'));
  for (const rule of LIBS) {
    const ev: Evidence[] = [];
    if (rule.pkgs) {
      for (const pkg of rule.pkgs) {
        const hits = inp.classNames.filter((c) => c.startsWith(pkg));
        if (hits.length) ev.push({ kind: 'class', value: `${pkg}* (${hits.length} classes)` });
      }
    }
    for (const re of rule.natives ?? []) for (const f of natives) if (re.test(f)) ev.push({ kind: 'native', value: f });
    for (const re of rule.files ?? []) {
      const f = inp.files.find((x) => re.test(x));
      if (f) ev.push({ kind: 'file', value: f });
    }
    if (ev.length) {
      out.push({ id: rule.id, name: rule.name, category: rule.category, confidence: Math.min(0.99, 0.6 + ev.length * 0.15), evidence: dedupe(ev).slice(0, 8) });
    }
  }
  return out;
}

const dedupe = (ev: Evidence[]) => ev.filter((e, i) => ev.findIndex((x) => x.kind === e.kind && x.value === e.value) === i);

/** Share of classes whose simple name and package segments look minified (R8/ProGuard style). */
export function obfuscationScore(classNames: string[], ownPackage: string) {
  const own = classNames.filter((c) => c.startsWith(ownPackage + '.') || !c.includes('.'));
  const pool = own.length >= 10 ? own : classNames;
  let short = 0;
  const samples: string[] = [];
  for (const c of pool) {
    const parts = c.split('.');
    const simple = parts[parts.length - 1].split('$')[0];
    if (simple.length <= 2 || (parts.length > 1 && parts.slice(0, -1).every((p) => p.length <= 2))) {
      short++;
      if (samples.length < 12) samples.push(c);
    }
  }
  const ratio = pool.length ? short / pool.length : 0;
  return { ratio, level: ratio > 0.5 ? 'forte' : ratio > 0.15 ? 'partielle' : 'faible', samples, scope: own.length >= 10 ? 'package applicatif' : 'toutes classes' };
}

// ───────────────────────── Features ─────────────────────────
export interface Feature {
  id: string;
  name: string;
  description: string;
  confidence: number;
  classes: string[];
  dependencies: string[];
  permissions: string[];
  resources: string[];
  missing: string[];
  scaffold?: string; // id of an APPXRAY template able to generate an independent implementation
}

interface FeatureRule {
  id: string;
  name: string;
  description: string;
  perms?: string[];
  classPatterns?: RegExp[];
  libs?: string[];
  resPatterns?: RegExp[];
  missing: string[];
  scaffold?: string;
}

const FEATURES: FeatureRule[] = [
  { id: 'auth', name: 'Authentification / connexion', description: "Écrans ou logique de connexion utilisateur (identifiants, jetons, fournisseurs d'identité).", classPatterns: [/login/i, /signin/i, /sign_in/i, /auth/i, /credential/i], libs: ['firebase-auth', 'facebook-sdk'], resPatterns: [/layout\/.*(login|signin|auth)/i], missing: ['Backend et API d\'authentification d\'origine', 'Identifiants, clés et jetons (jamais récupérés)'], scaffold: 'login' },
  { id: 'network', name: 'Communication réseau / API', description: 'Appels HTTP(S) vers des services distants.', perms: ['android.permission.INTERNET'], libs: ['okhttp', 'retrofit', 'volley', 'ktor', 'grpc'], classPatterns: [/Api(Service|Client)?$/, /HttpClient/i], missing: ['URL et contrat exact du serveur', 'Logique serveur'], scaffold: 'network' },
  { id: 'webview', name: 'Contenu Web embarqué', description: 'Affiche des pages web via WebView.', classPatterns: [/WebView/, /WebChromeClient/], libs: ['cordova', 'capacitor'], missing: ['Contenu distant chargé dynamiquement'], scaffold: 'webview' },
  { id: 'push', name: 'Notifications push', description: 'Réception de notifications distantes.', perms: ['android.permission.POST_NOTIFICATIONS'], libs: ['firebase-messaging', 'onesignal'], classPatterns: [/MessagingService$/, /NotificationManager/], missing: ['Projet Firebase / clés serveur (à recréer)'] },
  { id: 'location', name: 'Géolocalisation', description: 'Accès à la position de l\'appareil.', perms: ['android.permission.ACCESS_FINE_LOCATION', 'android.permission.ACCESS_COARSE_LOCATION'], classPatterns: [/LocationManager/, /FusedLocation/], libs: ['maps'], missing: ['Clé API Maps (à fournir)'] },
  { id: 'camera', name: 'Caméra / capture', description: 'Utilisation de la caméra (photo, vidéo, scan).', perms: ['android.permission.CAMERA'], libs: ['camerax', 'zxing', 'mlkit'], classPatterns: [/Camera/], missing: [] },
  { id: 'storage', name: 'Stockage local / base de données', description: 'Persistance locale (SQLite, Room, préférences, fichiers).', libs: ['room', 'realm', 'sqlcipher', 'datastore'], classPatterns: [/SQLiteOpenHelper/, /Dao$/, /Database$/, /SharedPreferences/], missing: ['Données utilisateurs (jamais extraites)'], scaffold: 'settings' },
  { id: 'payments', name: 'Paiements / achats intégrés', description: 'Achats in-app ou paiement en ligne.', perms: ['com.android.vending.BILLING'], libs: ['billing', 'stripe'], missing: ['Comptes marchands, identifiants produits côté console'] },
  { id: 'ads', name: 'Publicité', description: 'SDK publicitaires intégrés.', libs: ['admob', 'unity-ads', 'applovin', 'ironsource'], missing: ['Identifiants d\'unités publicitaires (à remplacer par les vôtres)'] },
  { id: 'analytics', name: 'Analytics / télémétrie', description: 'Collecte de statistiques d\'usage ou de plantages.', libs: ['firebase-analytics', 'firebase-crashlytics', 'appsflyer', 'adjust', 'mixpanel', 'sentry'], missing: ['Tableaux de bord et clés d\'origine'] },
  { id: 'media', name: 'Lecture audio / vidéo', description: 'Lecture de médias.', libs: ['media3'], classPatterns: [/MediaPlayer/, /ExoPlayer/, /AudioTrack/], resPatterns: [/\.(mp3|ogg|wav|mp4|webm|m4a)$/], missing: [] },
  { id: 'bluetooth', name: 'Bluetooth', description: 'Communication Bluetooth / BLE.', perms: ['android.permission.BLUETOOTH', 'android.permission.BLUETOOTH_CONNECT', 'android.permission.BLUETOOTH_SCAN'], classPatterns: [/Bluetooth/], missing: ['Protocole de l\'appareil distant'] },
  { id: 'biometric', name: 'Biométrie', description: 'Authentification par empreinte / visage.', perms: ['android.permission.USE_BIOMETRIC', 'android.permission.USE_FINGERPRINT'], classPatterns: [/BiometricPrompt/, /FingerprintManager/], missing: [] },
  { id: 'background', name: 'Tâches en arrière-plan', description: 'Services, alarmes ou travaux planifiés.', perms: ['android.permission.FOREGROUND_SERVICE', 'android.permission.RECEIVE_BOOT_COMPLETED', 'android.permission.WAKE_LOCK'], libs: ['workmanager'], classPatterns: [/Service$/, /Worker$/, /JobService/], missing: [] },
  { id: 'list', name: 'Listes / flux de contenu', description: 'Affichage de listes défilantes.', libs: ['recyclerview'], classPatterns: [/Adapter$/, /ViewHolder/], resPatterns: [/layout\/.*(item|row|cell)_/i], missing: ['Source de données réelle'], scaffold: 'list' },
];

export function detectFeatures(inp: DetectInput, libs: Detection[]): Feature[] {
  const libIds = new Set(libs.map((l) => l.id));
  const out: Feature[] = [];
  for (const r of FEATURES) {
    const perms = (r.perms ?? []).filter((p) => inp.permissions.includes(p));
    const deps = (r.libs ?? []).filter((l) => libIds.has(l)).map((l) => libs.find((x) => x.id === l)!.name);
    const classes = r.classPatterns ? inp.classNames.filter((c) => !/^(android|androidx|kotlin|java|javax|com\.google\.android\.material)\./.test(c) && r.classPatterns!.some((re) => re.test(c.split('.').pop()!))).slice(0, 25) : [];
    const res = r.resPatterns ? inp.files.filter((f) => r.resPatterns!.some((re) => re.test(f))).slice(0, 20) : [];
    const signals = (perms.length ? 1 : 0) + (deps.length ? 1.2 : 0) + (classes.length ? 1 : 0) + (res.length ? 0.6 : 0);
    if (signals < 0.9) continue;
    out.push({
      id: r.id,
      name: r.name,
      description: r.description,
      confidence: Math.min(0.95, 0.25 + signals * 0.22),
      classes,
      dependencies: deps,
      permissions: perms,
      resources: res,
      missing: r.missing,
      scaffold: r.scaffold,
    });
  }
  return out.sort((a, b) => b.confidence - a.confidence);
}

// ───────────────────────── Secrets ─────────────────────────
const SECRET_PATTERNS: [string, RegExp][] = [
  ['Google API key', /AIza[0-9A-Za-z_-]{35}/],
  ['AWS access key', /AKIA[0-9A-Z]{16}/],
  ['Private key', /-----BEGIN (RSA |EC |)PRIVATE KEY-----/],
  ['Slack token', /xox[baprs]-[0-9A-Za-z-]{10,}/],
  ['Stripe key', /(sk|pk|rk)_(live|test)_[0-9A-Za-z]{16,}/],
  ['JWT', /eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/],
  ['Generic secret', /(?:secret|passwd|password|api[_-]?key)\s*[:=]\s*["']?[A-Za-z0-9/+_-]{12,}/i],
];

export function secretKind(s: string): string | null {
  for (const [k, re] of SECRET_PATTERNS) if (re.test(s)) return k;
  return null;
}

/** Mask anything that looks like a credential. APPXRAY never displays or exports raw secrets. */
export function redact(s: string): string {
  let out = s;
  for (const [, re] of SECRET_PATTERNS) out = out.replace(new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g'), (m) => m.slice(0, 4) + '…[masqué]');
  return out;
}
