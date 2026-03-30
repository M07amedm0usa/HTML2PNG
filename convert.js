const puppeteer = require('puppeteer'); 
const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');

// دالة مساعدة للبحث عن الملفات في كل الفولدرات الفرعية
function getFilesRecursively(dir, extension) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach(file => {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat && stat.isDirectory()) {
      results = results.concat(getFilesRecursively(fullPath, extension));
    } else if (file.endsWith(extension)) {
      results.push(fullPath);
    }
  });
  return results;
}

(async () => {
  console.log('🚀 بدء تشغيل سكريبت التحويل...');
  
  const browser = await puppeteer.launch({
    headless: 'new', 
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
  });

  // قراءة الخطوط (تأكد من وجود فولدر fonts)
  let fontStyle = '';
  try {
    const cairoRegB64 = fs.readFileSync('fonts/Cairo-Regular.ttf').toString('base64');
    const cairoBoldB64 = fs.readFileSync('fonts/Cairo-Bold.ttf').toString('base64');
    const firaB64 = fs.readFileSync('fonts/FiraCode.ttf').toString('base64');
    fontStyle = `<style>
      @font-face { font-family: 'Cairo'; src: url('data:font/ttf;base64,${cairoRegB64}') format('truetype'); font-weight: 400; }
      @font-face { font-family: 'Cairo'; src: url('data:font/ttf;base64,${cairoBoldB64}') format('truetype'); font-weight: 700; }
      @font-face { font-family: 'Fira Code'; src: url('data:font/ttf;base64,${firaB64}') format('truetype'); font-weight: 100 900; }
    </style>`;
  } catch (e) {
    console.error('❌ خطأ في قراءة ملفات الخطوط: ', e.message);
  }

  const rtlFixStyle = `<style>
      html { direction: ltr !important; background: #030712 !important; }
      body { 
        direction: rtl !important; position: absolute !important; top: 0 !important; left: 0 !important; margin: 0 !important; 
        width: 1080px !important; height: max-content !important; min-height: 10px !important; overflow: visible !important; 
      }
    </style>`;

  const zipFiles = fs.readdirSync('input').filter(f => f.endsWith('.zip'));
  console.log(`📂 تم العثور على ${zipFiles.length} ملفات ZIP في مجلد input`);

  for (const zipFile of zipFiles) {
    const zipName = path.basename(zipFile, '.zip');
    const extractDir = path.join('temp', zipName);
    const outputDir = path.join('output', zipName);

    console.log(`📦 جاري معالجة: ${zipFile}`);
    const zip = new AdmZip(path.join('input', zipFile));
    zip.extractAllTo(extractDir, true);

    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

    // 🎯 استخدام البحث العميق لضمان لقط ملفات الـ HTML
    const htmlFiles = getFilesRecursively(extractDir, '.html');
    console.log(`🔍 تم العثور على ${htmlFiles.length} ملفات HTML`);

    for (const filePath of htmlFiles) {
      const page = await browser.newPage();
      await page.setViewport({ width: 1080, height: 1350 });

      let htmlContent = fs.readFileSync(filePath, 'utf8');
      htmlContent = htmlContent.replace(/<link[^>]*fonts\.(googleapis|gstatic)\.com[^>]*>/gi, '');
      htmlContent = htmlContent.replace(/<\/head>/i, `${fontStyle}\n${rtlFixStyle}\n</head>`);
      htmlContent = htmlContent.replace(/dir=["']rtl["']/gi, '');

      fs.writeFileSync(filePath, htmlContent, 'utf8');
      await page.goto(`file://${filePath}`, { waitUntil: 'networkidle0', timeout: 30000 });
      await new Promise(r => setTimeout(r, 1000));

      const dimensions = await page.evaluate(() => ({
          width: 1080,
          height: document.body.scrollHeight
      }));

      await page.setViewport({ width: dimensions.width, height: dimensions.height });

      const fileName = path.basename(filePath, '.html');
      const outputPath = path.join(outputDir, `${fileName}.png`);
      
      await page.screenshot({
        path: outputPath,
        omitBackground: false,
        clip: { x: 0, y: 0, width: dimensions.width, height: dimensions.height }
      });

      console.log(`✅ تم تصوير: ${fileName} (${dimensions.width}x${dimensions.height})`);
      await page.close();
    }

    // ضغط الصور الناتجة
    const outZip = new AdmZip();
    if (fs.existsSync(outputDir) && fs.readdirSync(outputDir).length > 0) {
      outZip.addLocalFolder(outputDir);
      // حفظ الـ ZIP في الفولدر الرئيسي لـ output عشان الـ YAML يشوفه
      const finalZipPath = path.join('output', `${zipName}.zip`);
      outZip.writeZip(finalZipPath);
      console.log(`🎉 تم إنشاء الملف النهائي: ${finalZipPath}`);
    } else {
      console.warn(`⚠️ تحذير: مجلد المخرجات ${outputDir} فارغ، لن يتم إنشاء ZIP.`);
    }

    if (fs.existsSync(extractDir)) fs.rmSync(extractDir, { recursive: true, force: true });
  }

  await browser.close();
  console.log('🏁 انتهت المهمة بنجاح.');
})();
