// Exporta cada slide como MP4 en alta calidad (1920x1080, 30 fps).
// En vez de grabar la pantalla en tiempo real, congela las animaciones y
// captura cuadro por cuadro, así el movimiento sale perfecto y sin saltos.
//
// Uso:
//   node export.js              → exporta las 5 slides
//   node export.js 2 4          → exporta solo la 2 y la 4
//
// Los videos quedan en la carpeta export/.

const { chromium } = require('playwright');
const ffmpegPath = require('ffmpeg-static');
const { spawn } = require('child_process');
const { pathToFileURL } = require('url');
const path = require('path');
const fs = require('fs');

const FPS = 30;
const SCALE = 1.5; // 1280x720 * 1.5 = 1920x1080

// Duración de cada video en segundos (guion + margen para recortar en el editor)
const DURATIONS = { 1: 25, 2: 35, 3: 26, 4: 27, 5: 29 }; // audios: 12.5 · 33.5 · 24.3 · 25.6 · 27.3 s

async function exportSlide(browser, n) {
  const html = path.join(__dirname, 'slides', `slide${n}`, `slide${n}.html`);
  const outDir = path.join(__dirname, 'export');
  fs.mkdirSync(outDir, { recursive: true });
  const out = path.join(outDir, `slide${n}.mp4`);
  const totalFrames = DURATIONS[n] * FPS;

  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: SCALE });
  await page.goto(pathToFileURL(html).href, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);

  // Congela todas las animaciones (CSS + SVG) para poder moverlas a mano
  await page.evaluate(() => {
    window.__anims = document.getAnimations();
    window.__anims.forEach(a => a.pause());
    document.querySelectorAll('svg').forEach(s => s.pauseAnimations && s.pauseAnimations());
    window.__seek = t => {
      window.__anims.forEach(a => { a.currentTime = t * 1000; });
      document.querySelectorAll('svg').forEach(s => s.setCurrentTime && s.setCurrentTime(t));
    };
  });

  const ff = spawn(ffmpegPath, [
    '-y', '-loglevel', 'error',
    '-f', 'image2pipe', '-framerate', String(FPS), '-i', '-',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '14', '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart', out
  ], { stdio: ['pipe', 'inherit', 'inherit'] });
  const done = new Promise((res, rej) => ff.on('close', c => c === 0 ? res() : rej(new Error('ffmpeg salió con código ' + c))));

  for (let f = 0; f < totalFrames; f++) {
    await page.evaluate(t => window.__seek(t), f / FPS);
    const png = await page.screenshot({ type: 'png' });
    if (!ff.stdin.write(png)) await new Promise(r => ff.stdin.once('drain', r));
    if (f % FPS === 0) process.stdout.write(`\r  slide${n}: ${Math.round(f / totalFrames * 100)}%   `);
  }
  ff.stdin.end();
  await done;
  await page.close();
  console.log(`\r  slide${n}: listo → export/slide${n}.mp4 (${DURATIONS[n]} s)`);
}

(async () => {
  const args = process.argv.slice(2).map(Number).filter(n => DURATIONS[n]);
  const slides = args.length ? args : Object.keys(DURATIONS).map(Number);
  const browser = await chromium.launch();
  for (const n of slides) await exportSlide(browser, n);
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
