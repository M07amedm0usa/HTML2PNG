const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');

(async () => {
  // تشغيل المتصفح بإعدادات مناسبة لسيرفرات لينكس
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

  // تجهيز ستايل الخطوط
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

    // فك ضغط الملف
    const zip = new AdmZip(`input/${zipFile}`);
    zip.extractAllTo(extractDir, true);

    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

    const htmlFiles = fs.readdirSync(extractDir).filter(f => f.endsWith('.html'));

    for (const file of htmlFiles) {
      const page = await browser.newPage();
      
      // تحديد أبعاد مبدئية
      await page.setViewport({ width: 1080, height: 1350 });

      const filePath = path.resolve(extractDir, file);
      
      // 1. قراءة محتوى الـ HTML كـ Text
      let htmlContent = fs.readFileSync(filePath, 'utf8');

      // 2. إزالة طلبات خطوط جوجل لتسريع التحميل ومنع التعارض
      htmlContent = htmlContent.replace(/<link[^>]*fonts\.(googleapis|gstatic)\.com[^>]*>/gi, '');

      // 3. إضافة خطوط عربية بديلة (Fallback) لضمان عدم اختفاء النص
      htmlContent = htmlContent.replace(/font-family:\s*'Cairo'/g, "font-family: 'Cairo', 'KacstOne', 'Noto Sans Arabic'");

      // 4. حقن الخطوط الـ Base64 جوه الـ HTML نفسه قبل قفلة الـ head
      htmlContent = htmlContent.replace(/<\/head>/i, `${fontStyle}\n</head>`);

      // 5. حفظ الملف بالتعديلات الجديدة عشان المتصفح يقرأه جاهز
      fs.writeFileSync(filePath, htmlContent, 'utf8');

      // 6. فتح الملف المحلي بعد التعديل
      await page.goto(`file://${filePath}`, {
        waitUntil: 'networkidle0',
        timeout: 30000
      });

      // إعطاء وقت إضافي بسيط للتأكد من تطبيق الخطوط (Rendering)
      await new Promise(r => setTimeout(r, 1000));

      // 7. التقاط عنصر الـ body نفسه مباشرة عشان نتفادى مشاكل إحداثيات الـ RTL
      const bodyHandle = await page.$('body');
      const name = path.basename(file, '.html');
      
      if (bodyHandle) {
        await bodyHandle.screenshot({
          path: `${outputDir}/${name}.png`,
          omitBackground: false
        });
        console.log(`✅ ${zipName}/${file} → Captured via Body Handle`);
        await bodyHandle.dispose(); // تفريغ الذاكرة
      } else {
        console.log(`❌ ${zipName}/${file} → Body not found!`);
      }

      await page.close();
    }

    // ضغط الصور الناتجة
    const outZip = new AdmZip();
    outZip.addLocalFolder(outputDir);
    outZip.writeZip(`output/${zipName}.zip`);
    console.log(`📦 ${zipName}.zip جاهز في مجلد output`);
  }

  await browser.close();
})();
