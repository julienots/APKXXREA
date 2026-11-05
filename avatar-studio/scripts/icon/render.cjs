// Renders the launcher icon (scripts/icon/icon.html) into every mipmap density.
const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 512, height: 512 } });
  await p.goto('file://' + path.join(__dirname, 'icon.html'));
  await p.waitForTimeout(400);
  const res = path.join(__dirname, '../../android/src/main/res');
  const sizes = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 };
  const big = path.join(__dirname, 'icon-512.png');
  await p.locator('#i').screenshot({ path: big, omitBackground: true });
  for (const [d, s] of Object.entries(sizes)) {
    const q = await b.newPage({ viewport: { width: s, height: s } });
    await q.setContent(`<html><body style="margin:0;background:transparent"><img src="data:image/png;base64,${require('fs').readFileSync(big).toString('base64')}" style="width:${s}px;height:${s}px;display:block"></body></html>`);
    await q.screenshot({ path: `${res}/mipmap-${d}/ic_launcher.png`, omitBackground: true });
  }
  await b.close();
})();
