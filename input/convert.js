const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');

(async () => {
  const browser = await puppeteer.launch({
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const zipFiles = fs.readdirSync('input').filter(f => f.endsWith('.zip'));

  for (const zipFile of zipFiles) {
    const zipName = path.basename(zipFile, '.zip');
    const extractDir = `temp/${zipName}`;
    const outputDir = `output/${zipName}`;

    const zip = new AdmZip(`input/${zipFile}`);
    zip.extractAllTo(extractDir, true);

    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

    const htmlFiles = fs.readdirSync(extractDir).filter(f => f.endsWith('.html'));

    for (const file of htmlFiles) {
      const page = await browser.newPage();

      await page.setViewport({ width: 1080, height: 1920 });

      const html = fs.readFileSync(`${extractDir}/${file}`, 'utf8');
      await page.setContent(html, { 
        waitUntil: 'networkidle0',
        timeout: 30000 
      });

      // استنى عشان الـ fonts تتحمل
      await new Promise(r => setTimeout(r, 1000));

      const dimensions = await page.evaluate(() => {
        const body = document.body;
        const width = body.scrollWidth;
        const children = body.children;
        const lastChild = children[children.length - 1];
        const rect = lastChild.getBoundingClientRect();
        const height = Math.ceil(rect.bottom) + 20;
        return { width, height };
      });

      await page.setViewport({
        width: dimensions.width,
        height: dimensions.height
      });

      const name = path.basename(file, '.html');
      await page.screenshot({
        path: `${outputDir}/${name}.png`,
        clip: {
          x: 0,
          y: 0,
          width: dimensions.width,
          height: dimensions.height
        }
      });

      console.log(`✅ ${zipName}/${file} → ${dimensions.width}x${dimensions.height}`);
      await page.close();
    }

    const outZip = new AdmZip();
    outZip.addLocalFolder(outputDir);
    outZip.writeZip(`output/${zipName}.zip`);
    console.log(`📦 ${zipName}.zip جاهز`);
  }

  await browser.close();
})();
