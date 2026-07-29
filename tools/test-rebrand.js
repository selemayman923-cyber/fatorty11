/* اختبار: التأكد من اكتمال الريبراندينج لـ SNS بأمان */
const fs = require('fs');
const { JSDOM, VirtualConsole } = require('jsdom');
const file = process.argv[2] || 'index.html';
let pass = 0, fail = 0;
const ok = (n, c, extra) => { c ? (pass++, console.log('  ✅ ' + n)) : (fail++, console.log('  ❌ ' + n + (extra ? '\n       ' + extra : ''))); };
const html = fs.readFileSync(file, 'utf8');

console.log('▶ إزالة اسم العلامة القديمة (نصوص واجهة المستخدم)');
ok('مفيش "فاتورتي" (عربي) متبقّي', (html.match(/فاتورتي/g) || []).length === 0, 'باقي: ' + (html.match(/فاتورتي/g) || []).length);
ok('مفيش "Fatorty" متبقّي', (html.match(/Fatorty/g) || []).length === 0);
ok('مفيش "FATORTY" متبقّي', (html.match(/FATORTY/g) || []).length === 0);

console.log('\n▶ العلامة الجديدة ظاهرة في الأماكن الحساسة');
ok('العنوان (title) فيه SNS', /<title>SNS/.test(html));
ok('apple-mobile-web-app-title فيه SNS', /apple-mobile-web-app-title" content="SNS"/.test(html));
ok('og:site_name فيه SNS', /og:site_name" content="SNS"/.test(html));
ok('theme-color بقى كحلي (#0a2c56)', (html.match(/theme-color" content="#0a2c56"/g) || []).length === 2);

console.log('\n▶ الألوان اتغيّرت للهوية الجديدة (كحلي + أخضر)');
ok('اللون الأساسي الجديد --primary:#0a2c56', /--primary:#0a2c56/.test(html));
ok('اللون الداكن --primary-d:#071d3d', /--primary-d:#071d3d/.test(html));
ok('لون التمييز الجديد --accent:#17883a', /--accent:#17883a/.test(html));
ok('مفيش أي أثر للأخضر الزمردي القديم (#0f6b5c)', (html.match(/#0f6b5c/gi) || []).length === 0);
ok('مفيش أي أثر للبرتقالي القديم (#c9783b)', (html.match(/#c9783b/gi) || []).length === 0);
ok('ثيم SNS الافتراضي في قائمة Aa محدّث', /ar: 'SNS \(افتراضي\)'/.test(html));

console.log('\n▶ الشعار الحقيقي مُستخدَم (مش أيقونة قديمة)');
ok('الفافيكون بقى PNG (الشعار الحقيقي) مش SVG قديم', /rel="icon" type="image\/png"/.test(html));
ok('apple-touch-icon موجود بحجم 180', /apple-touch-icon" sizes="180x180"/.test(html));

console.log('\n▶ شعارات داخل الواجهة (صفحة الهبوط + شاشة عن التطبيق)');
ok('مفيش أيقونة الإيصال القديمة (viewBox 0 0 64 64)', (html.match(/viewBox="0 0 64 64"/g) || []).length === 0, 'باقي: ' + (html.match(/viewBox="0 0 64 64"/g) || []).length);
ok('الشعار الحقيقي مستخدم 3 مرات في الواجهة', (html.match(/alt="SNS"/g) || []).length === 3, 'لقيت: ' + (html.match(/alt="SNS"/g) || []).length);
ok('مفيش إيموجي إيصال 🧾 كشعار في شاشة عن التطبيق', !/font-size:56px[^>]*>🧾/.test(html));

console.log('\n▶ توحيد الوصف مع هوية SNS (Business Management System)');
ok('العنوان بقى "منصة إدارة أعمال متكاملة"', /<title>SNS — منصة إدارة أعمال متكاملة<\/title>/.test(html));
ok('مفيش وصف "نظام كاشير" القديم', (html.match(/نظام كاشير/g) || []).length === 0, 'باقي: ' + (html.match(/نظام كاشير/g) || []).length);
ok('شاشة عن التطبيق بتستخدم نص الشعار', /Business Management System/.test(html));

console.log('\n▶ حماية استمرارية البيانات (أهم جزء) — المعرّفات التقنية القديمة فضلت زي ما هي عمدًا');
ok('اسم قاعدة IndexedDB المحلية فضل fatorty_store (منعًا لفقد بيانات المستخدمين الحاليين)', /IDB_NAME='fatorty_store'/.test(html));

console.log('\n▶ بنية الملف سليمة');
const inlineBlocks = html.match(/<script(?![^>]*\bsrc=)[^>]*>[\s\S]*?<\/script>/gi) || [];
ok('عدد بلوكات السكربت = ٢', inlineBlocks.length === 2, 'لقيت ' + inlineBlocks.length);

console.log('\n' + '─'.repeat(50));
console.log(`النتيجة: ${pass} نجحت · ${fail} فشلت`);
process.exit(fail ? 1 : 0);
