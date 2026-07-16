// @ts-check
const { test, expect } = require("@playwright/test");

// اختبار دخان بسيط: الصفحة بتفتح، شاشة تسجيل الدخول بتظهر، ومفيش أخطاء JS غير متوقعة
// أثناء التحميل. مش اختبار وظيفي كامل (مفيش حساب Supabase حقيقي هنا) — الهدف بس إمساك
// كسر syntax/runtime قبل ما يوصل للمستخدمين، خصوصًا إن service worker بيحدّث الملف فورًا
// (network-first) بدون أي مراجعة وسيطة.
test("index.html boots to either the landing page or the sign-in screen, no JS errors", async ({ page }) => {
  const pageErrors = [];
  page.on("pageerror", (err) => pageErrors.push(err.message));

  await page.goto("/index.html");

  // أول زيارة (مفيش session) الطبيعي إنها تعرض صفحة الهبوط (#landing). لو الإنترنت
  // مقطوعة/محجوبة (زي CDN مكتبة supabase-js)، الكود بيتحوّل بنعومة لشاشة الأوث مباشرة
  // مع رسالة واضحة بدل ما يفضل تايه — الاتنين نتيجة "بووت ناجح" مقبولة هنا. اللي مش
  // مقبول هو إن مفيش أي حاجة من الاتنين تظهر (يعني الإقلاع اتوقف تمامًا).
  const landing = page.locator("#landing");
  const authEmail = page.locator("#authEmail");
  await page.waitForFunction(
    () =>
      document.getElementById("landing")?.style.display !== "none" ||
      document.getElementById("authScreen")?.style.display === "flex",
    { timeout: 15000 },
  );

  if (await landing.isVisible()) {
    await page.evaluate(() => window.landingLogin());
    await expect(authEmail).toBeVisible({ timeout: 5000 });
  }

  expect(pageErrors, `Uncaught JS errors during load:\n${pageErrors.join("\n")}`).toEqual([]);
});
