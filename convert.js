const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');

(async () => {
  // تفعيل المحرك الجديد الخاص بـ Chrome لتفادي بجات الـ RTL القديمة
  const browser = await puppeteer.launch({
    headless: 'new', 
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage'
    ]
  });

  const cairoRegB64 = fs.readFileSync('fonts/Cairo-Regular.ttf').toString('base64');
  const cairoBoldB64 = fs.readFileSync('fonts/Cairo-Bold.ttf').toString('base64');
  const firaB64 = fs.readFileSync('fonts/FiraCode.ttf').toString('base64');

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

  // الحيلة السحرية لضبط إحداثيات الكاميرا مع العربي
  const rtlFixStyle = `
    <style>
      /* إجبار الصفحة تبدأ من الشمال عشان الكاميرا متصورش الهوا */
      html { direction: ltr !important; background: #030712 !important; }
      /* إرجاع المحتوى لليمين وتثبيته في زاوية الكاميرا بالقوة */
      body { 
        direction: rtl !important; 
        position: absolute !important; 
        top: 0 !important; 
        left: 0 !important; 
        margin: 0 !important; 
        width: 1080px !important; 
        height: 1350px !important; 
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

      const filePath = path.resolve(extractDir, file);
      let htmlContent = fs.readFileSync(filePath, 'utf8');

      htmlContent = htmlContent.replace(/<link[^>]*fonts\.(googleapis|gstatic)\.com[^>]*>/gi, '');
      
      // دمج ستايل الخطوط + ستايل إصلاح الـ RTL قبل قفلة الـ head
      htmlContent = htmlContent.replace(/<\/head>/i, `${fontStyle}\n${rtlFixStyle}\n</head>`);

      // لو ملف عربي، نمسح dir="rtl" من الـ html عشان الـ CSS الجديد يشتغل صح
      if (file.includes('_ar_')) {
        htmlContent = htmlContent.replace(/dir=["']rtl["']/gi, '');
      }

      fs.writeFileSync(filePath, htmlContent, 'utf8');

      await page.goto(`file://${filePath}`, {
        waitUntil: 'networkidle0',
        timeout: 30000
      });

      await new Promise(r => setTimeout(r, 1000));

      const name = path.basename(file, '.html');
      
      // نرجع للـ screenshot العادية بس بأبعاد ثابتة ومقصوصة (Clip)
      await page.screenshot({
        path: `${outputDir}/${name}.png`,
        omitBackground: false,
        clip: { x: 0, y: 0, width: 1080, height: 1350 }
      });

      console.log(`✅ ${zipName}/${file} → Captured successfully`);
      await page.close();
    }

    const outZip = new AdmZip();
    outZip.addLocalFolder(outputDir);
    outZip.writeZip(`output/${zipName}.zip`);
    console.log(`📦 ${zipName}.zip جاهز في مجلد output`);
  }

  await browser.close();
})();
