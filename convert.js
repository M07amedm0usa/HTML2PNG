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

  // قراءة الخطوط وتحويلها لـ Base64
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

  // الحيلة السحرية لضبط الإحداثيات مع جعل الارتفاع ديناميكي (يأخذ حجم المحتوى فقط)
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
        width: 1080px !important; /* تثبيت العرض */
        height: max-content !important; /* إجبار الارتفاع على احتواء المحتوى فقط */
        min-height: 10px !important;
        overflow: visible !important; /* إلغاء القص الثابت من ملفاتك الأصلية */
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
      
      // نحدد عرض مبدئي
      await page.setViewport({ width: 1080, height: 1350 });

      const filePath = path.resolve(extractDir, file);
      let htmlContent = fs.readFileSync(filePath, 'utf8');

      htmlContent = htmlContent.replace(/<link[^>]*fonts\.(googleapis|gstatic)\.com[^>]*>/gi, '');
      
      // دمج ستايل الخطوط + ستايل إصلاح الـ RTL قبل قفلة الـ head
      htmlContent = htmlContent.replace(/<\/head>/i, `${fontStyle}\n${rtlFixStyle}\n</head>`);

      // 🎯 التعديل هنا: مسح الـ if وتطبيق التعديل على كل الملفات مباشرة عشان كلها بقت عربي
      htmlContent = htmlContent.replace(/dir=["']rtl["']/gi, '');

      fs.writeFileSync(filePath, htmlContent, 'utf8');

      await page.goto(`file://${filePath}`, {
        waitUntil: 'networkidle0',
        timeout: 30000
      });

      await new Promise(r => setTimeout(r, 1000));

      // 1. حساب الأبعاد الفعلية للمحتوى بعد الرندر
      const dimensions = await page.evaluate(() => {
        return {
          width: 1080, // العرض ثابت لسلايدز إنستجرام
          height: document.body.scrollHeight // الارتفاع يتحدد بناءً على المحتوى الفعلي
        };
      });

      // 2. ضبط الكاميرا (Viewport) لتتطابق تماماً مع أبعاد المحتوى
      await page.setViewport({
        width: dimensions.width,
        height: dimensions.height
      });

      const name = path.basename(file, '.html');
      
      // 3. التقاط الصورة بالأبعاد الديناميكية الجديدة
      await page.screenshot({
        path: `${outputDir}/${name}.png`,
        omitBackground: false,
        clip: { x: 0, y: 0, width: dimensions.width, height: dimensions.height }
      });

      console.log(`✅ ${zipName}/${file} → Captured dynamically: ${dimensions.width}x${dimensions.height}`);
      await page.close();
    }

    const outZip = new AdmZip();
    outZip.addLocalFolder(outputDir);
    outZip.writeZip(`output/${zipName}.zip`);
    console.log(`📦 ${zipName}.zip جاهز في مجلد output`);
    
    // مسح ملفات الـ HTML المفكوكة عشان جيت هاب ميرفعهاش، لكن الصور الـ PNG هتفضل زي ما هي!
    if (fs.existsSync(extractDir)) {
      fs.rmSync(extractDir, { recursive: true, force: true });
    }
  }

  await browser.close();
})();
          
