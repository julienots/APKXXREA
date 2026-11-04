import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import { config } from './config.js';
import { ensureDirs } from './store.js';
import { api } from './api.js';
import { toolStatus } from './engines/tools.js';
import { loadFramework } from './engines/framework.js';

async function main() {
  await ensureDirs();
  const app = express();
  app.disable('x-powered-by');
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    next();
  });
  app.use('/api', api());
  if (fs.existsSync(config.webDist)) {
    app.use(express.static(config.webDist, { index: false, maxAge: '1h' }));
    app.get(/^\/(?!api\/).*/, (_req, res) => res.sendFile(path.join(config.webDist, 'index.html')));
  }
  app.listen(config.port, config.host, () => {
    const t = toolStatus();
    console.log(`APPXRAY server → http://${config.host}:${config.port}`);
    console.log(`  data: ${config.dataDir}`);
    console.log(`  tools: jadx=${t.jadx ?? '—'} apktool=${t.apktool ?? '—'} aapt2=${t.aapt2 ? 'ok' : '—'} sdk=${t.androidSdk?.path ?? '—'} netns=${t.sandbox.netns}`);
    if (config.host !== '127.0.0.1' && !config.token) console.warn('  ⚠ Serveur exposé sans APPXRAY_TOKEN : définissez un jeton.');
  });
  void loadFramework();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
