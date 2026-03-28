const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');

(async () => {
  const browser = await puppeteer.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--font-render-hinting=none'
    ]
  });

  // قراءة الخطوط وتحويلها لـ Base64
  const cairoRegB64 = fs.readFileSync('fonts/Cairo-Regular.ttf').toString('base64');
  const cairoBoldB64 = fs.readFileSync('fonts/Cairo-Bold.ttf').toString('base64');
  const firaB64 = fs.readFileSync('fonts/FiraCode.ttf').toString('base64');

  // تجهيز ستايل الخطوط (تم تعديل وزن الخط البولد لـ 700)
  const fontStyle = `
    <style>
      @font-face {
        font-family: 'Cairo';
        src: url('data:font/ttf;base64,${cairoRegB64}') format('truetype');
        font-weight: 400;
      }
      @font-face {
        font-family: 'Cairo';
        src: url('data:font/ttf;base64,${cairoBoldB64}') format('truetype');
        font-weight: 700; 
      }
      @font-face {
        font-family: 'Fira Code';
        src: url('data:font/ttf;base64,${firaB64}') format('truetype');
        font-weight: 100 900;
      }
    </style>
  `;

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
      await page.setViewport({ width: 1080, height: 1350 });

      // تفعيل اعتراض الطلبات لمنع تحميل خطوط جوجل الخارجية
      await page.setRequestInterception(true);
      page.on('request', (req) => {
        if (req.url().includes('fonts.googleapis.com') || req.url().includes('fonts.gstatic.com')) {
          req.abort(); 
        } else {
          req.continue();
        }
      });

      // فتح الملف كمسار محلي لضمان تحميل الـ CSS والصور المرفقة
      const filePath = path.resolve(extractDir, file);
      await page.goto(`file://${filePath}`, {
        waitUntil: 'networkidle0',
        timeout: 30000
      });

      // حقن كود الخطوط
      await page.addStyleTag({ content: fontStyle });

      // التأكد من تطبيق الخطوط على الـ DOM
      await page.evaluate(async () => {
        await document.fonts.ready;
      });
      await new Promise(r => setTimeout(r, 1000));

      // حساب الأبعاد الديناميكية
      const dimensions = await page.evaluate(() => {
        const style = window.getComputedStyle(document.body);
        let width = parseInt(style.width);
        let height = parseInt(style.height);
        if (!width || width < 100) width = document.body.scrollWidth;
        if (!height || height < 100) height = document.body.scrollHeight;
        return { width, height };
      });

      await page.setViewport({
        width: dimensions.width,
        height: dimensions.height
      });

      const name = path.basename(file, '.html');
      await page.screenshot({
        path: `${outputDir}/${name}.png`,
        omitBackground: false,
        clip: { x: 0, y: 0, width: dimensions.width, height: dimensions.height }
      });

      console.log(`✅ ${zipName}/${file} → ${dimensions.width}x${dimensions.height}`);
      await page.close();
    }

    // ضغط الصور الناتجة
    const outZip = new AdmZip();
    outZip.addLocalFolder(outputDir);
    outZip.writeZip(`output/${zipName}.zip`);
    console.log(`📦 ${zipName}.zip جاهز`);
  }

  await browser.close();
})();
