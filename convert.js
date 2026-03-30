const puppeteer = require('puppeteer'); 
const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');

// دالة البحث الشامل عن أي ملفات
function getFilesRecursively(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach(file => {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat && stat.isDirectory()) {
      results = results.concat(getFilesRecursively(fullPath));
    } else {
      results.push(fullPath);
    }
  });
  return results;
}

(async () => {
  console.log('🚀 بدء الفحص الشامل للملفات...');
  
  const browser = await puppeteer.launch({
    headless: 'new', 
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
  });

  // قراءة الخطوط
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
  } catch (e) { console.log('⚠️ لم يتم العثور على ملفات الخطوط، سيتم استخدام خطوط النظام.'); }

  const rtlFixStyle = `<style>html { direction: ltr !important; background: #030712 !important; } body { direction: rtl !important; position: absolute !important; top: 0 !important; left: 0 !important; margin: 0 !important; width: 1080px !important; height: max-content !important; min-height: 10px !important; overflow: visible !important; }</style>`;

  // 1. البحث عن ملفات الـ ZIP في كل مكان (Root & input)
  const allFiles = getFilesRecursively('.');
  const zipFiles = allFiles.filter(f => f.endsWith('.zip') && !f.includes('node_modules') && !f.includes('temp') && !f.includes('output'));
  
  console.log(`📂 الملفات المكتشفة: ${zipFiles.join(', ')}`);

  for (const zipPath of zipFiles) {
    const zipName = path.basename(zipPath, '.zip');
    const extractDir = path.join('temp', zipName);
    const outputDir = path.join('output', zipName);

    console.log(`📦 جاري فك ضغط: ${zipPath}`);
    const zip = new AdmZip(zipPath);
    zip.extractAllTo(extractDir, true);

    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

    // 🎯 التعديل الجوهري: لقط أي ملف جواه كلمة "slide" أو "html"
    const extractedFiles = getFilesRecursively(extractDir);
    const targetFiles = extractedFiles.filter(f => f.toLowerCase().includes('slide') || f.endsWith('.html'));

    console.log(`🔍 وجدنا ${targetFiles.length} شريحة للمعالجة.`);

    for (const filePath of targetFiles) {
      const page = await browser.newPage();
      await page.setViewport({ width: 1080, height: 1350 });

      let htmlContent = fs.readFileSync(filePath, 'utf8');
      
      // تأمين إننا بنتعامل مع HTML فعلاً
      if (!htmlContent.includes('<html') && !htmlContent.includes('<body')) {
          console.log(`⏩ تخطي الملف: ${filePath} (ليس HTML)`);
          await page.close();
          continue;
      }

      htmlContent = htmlContent.replace(/<link[^>]*fonts\.(googleapis|gstatic)\.com[^>]*>/gi, '');
      htmlContent = htmlContent.replace(/<\/head>/i, `${fontStyle}\n${rtlFixStyle}\n</head>`);
      htmlContent = htmlContent.replace(/dir=["']rtl["']/gi, '');

      fs.writeFileSync(filePath, htmlContent, 'utf8');
      await page.goto(`file://${filePath}`, { waitUntil: 'networkidle0', timeout: 30000 });
      await new Promise(r => setTimeout(r, 1000));

      const dimensions = await page.evaluate(() => ({ width: 1080, height: document.body.scrollHeight }));
      await page.setViewport({ width: dimensions.width, height: dimensions.height });

      const fileName = path.basename(filePath).replace(/\.[^/.]+$/, ""); // حذف أي امتداد قديم
      const outputPath = path.join(outputDir, `${fileName}.png`);
      
      await page.screenshot({ path: outputPath, clip: { x: 0, y: 0, width: dimensions.width, height: dimensions.height } });
      console.log(`✅ تم تصوير: ${fileName}`);
      await page.close();
    }

    const outZip = new AdmZip();
    if (fs.readdirSync(outputDir).length > 0) {
      outZip.addLocalFolder(outputDir);
      outZip.writeZip(path.join('output', `${zipName}.zip`));
      console.log(`🎉 تم إنشاء الملف النهائي بنجاح!`);
    }
    
    if (fs.existsSync(extractDir)) fs.rmSync(extractDir, { recursive: true, force: true });
  }

  await browser.close();
})();
    
