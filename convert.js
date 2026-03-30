const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');

(async () => {
  console.log('🚀 بدء تحويل السلايدز العربية لـ FlutterByMousa...');
  
  const browser = await puppeteer.launch({
    headless: 'new', 
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
  });

  // قراءة الخطوط الأساسية للبراند
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

  // ستايل إصلاح الـ RTL لضمان إن Puppeteer يصور المحتوى العربي في مكانه الصح
  const rtlFixStyle = `
    <style>
      html { direction: ltr !important; background: #030712 !important; }
      body { 
        direction: rtl !important; position: absolute !important; top: 0 !important; left: 0 !important; margin: 0 !important; 
        width: 1080px !important; height: max-content !important; min-height: 10px !important; overflow: visible !important; 
      }
    </style>
  `;

  // البحث عن ملفات الـ ZIP اللي وصلت من n8n
  const zipFiles = fs.readdirSync('input').filter(f => f.endsWith('.zip'));
  console.log(`📂 تم العثور على ${zipFiles.length} ملف ZIP معلق.`);

  for (const zipFile of zipFiles) {
    const zipName = path.basename(zipFile, '.zip');
    const extractDir = path.join('temp', zipName);
    const outputDir = path.join('output', zipName);

    const zip = new AdmZip(path.join('input', zipFile));
    zip.extractAllTo(extractDir, true);

    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

    // لقط ملفات الـ HTML (بما إنك ضفت .html في نود الكود، السكريبت هيشوفهم فوراً)
    const htmlFiles = fs.readdirSync(extractDir).filter(f => f.endsWith('.html'));
    console.log(`🔍 جاري معالجة ${htmlFiles.length} سلايد عربي...`);

    for (const file of htmlFiles) {
      const page = await browser.newPage();
      await page.setViewport({ width: 1080, height: 1350 });

      const filePath = path.resolve(extractDir, file);
      let htmlContent = fs.readFileSync(filePath, 'utf8');

      // تنظيف الروابط الخارجية وحقن الخطوط المحلية والـ RTL Fix
      htmlContent = htmlContent.replace(/<link[^>]*fonts\.(googleapis|gstatic)\.com[^>]*>/gi, '');
      htmlContent = htmlContent.replace(/<\/head>/i, `${fontStyle}\n${rtlFixStyle}\n</head>`);
      
      // مسح أي dir="rtl" قديمة عشان الـ Fix بتاعنا يشتغل صح
      htmlContent = htmlContent.replace(/dir=["']rtl["']/gi, '');

      fs.writeFileSync(filePath, htmlContent, 'utf8');

      await page.goto(`file://${filePath}`, { waitUntil: 'networkidle0', timeout: 30000 });
      await new Promise(r => setTimeout(r, 1000));

      const dimensions = await page.evaluate(() => ({
          width: 1080,
          height: document.body.scrollHeight
      }));

      await page.setViewport({ width: dimensions.width, height: dimensions.height });

      const name = path.basename(file, '.html');
      const outputPath = path.join(outputDir, `${name}.png`);
      
      await page.screenshot({
        path: outputPath,
        omitBackground: false,
        clip: { x: 0, y: 0, width: dimensions.width, height: dimensions.height }
      });

      console.log(`✅ تم تصوير: ${name}`);
      await page.close();
    }

    // ضغط الصور النهائية في ملف ZIP واحد للتحميل
    const outZip = new AdmZip();
    if (fs.readdirSync(outputDir).length > 0) {
        outZip.addLocalFolder(outputDir);
        outZip.writeZip(path.join('output', `${zipName}.zip`));
        console.log(`📦 ملف الـ PNGs جاهز: output/${zipName}.zip`);
    }

    // تنظيف ملفات الـ HTML المؤقتة
    if (fs.existsSync(extractDir)) fs.rmSync(extractDir, { recursive: true, force: true });
  }

  await browser.close();
  console.log('🏁 انتهت العملية بنجاح!');
})();
