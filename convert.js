const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');

(async () => {
  // التأكد من وجود المجلدات الضرورية
  if (!fs.existsSync('temp')) fs.mkdirSync('temp');
  if (!fs.existsSync('output')) fs.mkdirSync('output');

  const browser = await puppeteer.launch({
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--font-render-hinting=none' // لتحسين جودة الخطوط العربية
    ]
  });

  // قراءة الخطوط (تأكد أن المسار fonts/ موجود في الريبو)
  let fontStyle = '';
  try {
    const cairoRegB64 = fs.readFileSync('fonts/Cairo-Regular.ttf').toString('base64');
    const cairoBoldB64 = fs.readFileSync('fonts/Cairo-Bold.ttf').toString('base64');
    const firaB64 = fs.readFileSync('fonts/FiraCode.ttf').toString('base64');
    
    fontStyle = `
      <style>
        @font-face { font-family: 'Cairo'; src: url('data:font/ttf;base64,${cairoRegB64}') format('truetype'); font-weight: 400; }
        @font-face { font-family: 'Cairo'; src: url('data:font/ttf;base64,${cairoBoldB64}') format('truetype'); font-weight: 700; }
        @font-face { font-family: 'Fira Code'; src: url('data:font/ttf;base64,${firaB64}') format('truetype'); }
      </style>`;
  } catch (e) {
    console.log("⚠️ Fonts not found, proceeding with system fonts.");
  }

  const rtlFixStyle = `
    <style>
      html { direction: ltr !important; background: #030712 !important; }
      body { 
        direction: rtl !important; position: absolute !important; 
        top: 0 !important; left: 0 !important; margin: 0 !important; 
        width: 1080px !important; height: auto !important;
        min-height: 100vh; overflow: visible !important;
      }
    </style>`;

  const zipFiles = fs.readdirSync('input').filter(f => f.endsWith('.zip'));

  for (const zipFile of zipFiles) {
    const zipName = path.basename(zipFile, '.zip');
    const extractDir = path.join('temp', zipName);
    const outputImagesDir = path.join('temp', `${zipName}_pngs`);

    // فك الضغط
    const zip = new AdmZip(path.join('input', zipFile));
    zip.extractAllTo(extractDir, true);

    if (!fs.existsSync(outputImagesDir)) fs.mkdirSync(outputImagesDir, { recursive: true });

    const htmlFiles = fs.readdirSync(extractDir).filter(f => f.endsWith('.html'));

    for (const file of htmlFiles) {
      const page = await browser.newPage();
      await page.setViewport({ width: 1080, height: 1350 });

      const filePath = path.resolve(extractDir, file);
      let htmlContent = fs.readFileSync(filePath, 'utf8');

      // دمج الستايلات
      htmlContent = htmlContent.replace(/<\/head>/i, `${fontStyle}\n${rtlFixStyle}\n</head>`);
      
      // إصلاح الـ RTL (مهم جداً للـ Chromium الجديد)
      htmlContent = htmlContent.replace(/dir=["']rtl["']/gi, '');
      
      fs.writeFileSync(filePath, htmlContent, 'utf8');

      await page.goto(`file://${filePath}`, { waitUntil: 'networkidle0' });
      await new Promise(r => setTimeout(r, 500)); // وقت كافٍ للـ Fonts

      const dimensions = await page.evaluate(() => ({
        width: 1080,
        height: Math.max(document.documentElement.scrollHeight, document.body.scrollHeight, 10)
      }));

      await page.setViewport(dimensions);
      const name = path.basename(file, '.html');
      
      await page.screenshot({
        path: path.join(outputImagesDir, `${name}.png`),
        fullPage: true // أفضل من الـ clip اليدوي في الحالات الديناميكية
      });

      console.log(`✅ Captured: ${name}.png (${dimensions.height}px height)`);
      await page.close();
    }

    // ضغط الصور الناتجة فقط
    const outZip = new AdmZip();
    outZip.addLocalFolder(outputImagesDir);
    const finalZipPath = path.join('output', `${zipName}.zip`);
    outZip.writeZip(finalZipPath);
    
    console.log(`📦 Generated ZIP: ${finalZipPath}`);
    
    // تنظيف المجلدات المؤقتة لتوفير المساحة
    fs.rmSync(extractDir, { recursive: true, force: true });
    fs.rmSync(outputImagesDir, { recursive: true, force: true });
  }

  await browser.close();
})();
