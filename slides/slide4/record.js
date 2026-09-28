// Graba una slide .html como video MP4 usando Chromium headless.
// Uso: node record.js <archivo.html> <nombre_salida_sin_extension> <duracion_ms>
// Ejemplo: node record.js slide2.html slide2 25000

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

(async () => {
  const [, , htmlFile, outName = 'output', durationArg = '25000'] = process.argv;
  if (!htmlFile) {
    console.error('Uso: node record.js <archivo.html> <nombre_salida> <duracion_ms>');
    process.exit(1);
  }
  const dir = __dirname;
  const duration = parseInt(durationArg, 10);

  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    recordVideo: { dir, size: { width: 1280, height: 720 } }
  });
  const page = await context.newPage();
  await page.goto('file://' + path.join(dir, htmlFile));
  await page.waitForTimeout(400); // que asienten las fuentes
  await page.waitForTimeout(duration);
  await context.close();
  const videoPath = await page.video().path();
  await browser.close();

  const finalPath = path.join(dir, outName + '.webm');
  fs.renameSync(videoPath, finalPath);
  console.log('Video crudo en: ' + finalPath);
  console.log('Convertir a mp4 con:');
  console.log(`  ffmpeg -y -i "${outName}.webm" -c:v libx264 -pix_fmt yuv420p -crf 18 -preset medium "${outName}.mp4"`);
})();
