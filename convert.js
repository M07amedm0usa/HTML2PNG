const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');

(async () => {
  const browser = await puppeteer.launch({
    headless: 'new', 
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
  });

  // قراءة الخطوط وتحويلها لـ Base64 لضمان الرندر الصحيح على السيرفر
  const cairoRegB64 = fs.readFileSync('fonts/Cairo-Regular.ttf').toString('base64');
  const cairoBoldB64 = fs.readFileSync('fonts/Cairo-Bold.ttf').toString('base64');
  const firaB64 = fs.readFileSync('fonts/FiraCode.ttf').toString('base64');

  const fontStyle = `
    <style>
      @font-face { font-family: 'Cairo'; src: url('data:font/ttf;base64,${cairoRegB64}') format('truetype'); font-weight: 400; }
      @font-face { font-family: 'Cairo'; src: url('data:font/ttf;base64,${cairoBoldB64}') format('truetype'); font-weight: 700; }
      @font-face { font-family: 'Fira Code'; src: url('data:font/ttf;base64,${firaB64}') format('truetype'); font-weight: 100 900; }
    </style>
  `;

  const rtlFixStyle = `
    <style>
      html { direction: ltr !important; background: #030712 !important; }
      body { 
        direction: rtl !important; 
        position: absolute !important; 
        top: 0 !important; left: 0 !important; margin: 0 !important; 
        width: 1080px !important; 
        height: max-content !important; 
        min-height: 10px !important;
        overflow: visible !important; 
      }
    </style>
  `;

  // البحث عن ملفات الـ ZIP في مجلد input
  const zipFiles = fs.readdirSync('input').filter(f => f.endsWith('.zip'));

  for (const zipFile of zipFiles) {
    const zipName = path.basename(zipFile, '.zip');
    const extractDir = path.join('temp', zipName);
    const outputDir = path.join('output', zipName);

    const zip = new AdmZip(path.join('input', zipFile));
    zip.extractAllTo(extractDir, true);

    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

    const htmlFiles = fs.readdirSync(extractDir).filter(f => f.endsWith('.html'));

    for (const file of htmlFiles) {
      const page = await browser.newPage();
      await page.setViewport({ width: 1080, height: 1350 });

      const filePath = path.resolve(extractDir, file);
      let htmlContent = fs.readFileSync(filePath, 'utf8');

      // تنظيف الروابط الخارجية للخطوط ودمج الخطوط المحلية
      htmlContent = htmlContent.replace(/<link[^>]*fonts\.(googleapis|gstatic)\.com[^>]*>/gi, '');
      htmlContent = htmlContent.replace(/<\/head>/i, `${fontStyle}\n${rtlFixStyle}\n</head>`);

      // 🎯 التعديل الأساسي: مسح dir="rtl" من الـ HTML مباشرة لأننا دايماً في وضع العربي
      htmlContent = htmlContent.replace(/dir=["']rtl["']/gi, '');

      fs.writeFileSync(filePath, htmlContent, 'utf8');

      await page.goto(`file://${filePath}`, { waitUntil: 'networkidle0', timeout: 30000 });
      await new Promise(r => setTimeout(r, 1000));

      const dimensions = await page.evaluate(() => {
        return {
          width: 1080,
          height: document.body.scrollHeight
        };
      });

      await page.setViewport({ width: dimensions.width, height: dimensions.height });

      const name = path.basename(file, '.html');
      
      await page.screenshot({
        path: path.join(outputDir, `${name}.png`),
        omitBackground: false,
        clip: { x: 0, y: 0, width: dimensions.width, height: dimensions.height }
      });

      console.log(`✅ Captured: ${zipName}/${file} (${dimensions.width}x${dimensions.height})`);
      await page.close();
    }

    const outZip = new AdmZip();
    outZip.addLocalFolder(outputDir);
    outZip.writeZip(path.join('output', `${zipName}.zip`));
    console.log(`📦 Generated ZIP: output/${zipName}.zip`);
    
    if (fs.existsSync(extractDir)) {
      fs.rmSync(extractDir, { recursive: true, force: true });
    }
  }

  await browser.close();
})();
