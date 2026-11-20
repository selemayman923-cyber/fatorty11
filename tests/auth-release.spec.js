const { test, expect } = require('@playwright/test');

test.use({ serviceWorkers: 'block' });

async function mockAuth(page, recovery = false) {
  await page.route(/^https?:\/\/(?!localhost[:/])/, route => route.abort());
  await page.route('**/vendor/supabase.min.js', route => route.fulfill({
    contentType: 'application/javascript',
    body: `window.authCalls=[];
    window.supabase={createClient:()=>({
      auth:{
        getSession:async()=>({data:{session:null}}),
        onAuthStateChange(callback){
          if(${recovery})Promise.resolve().then(()=>callback('PASSWORD_RECOVERY'));
          return {data:{subscription:{unsubscribe(){}}}};
        },
        signUp:async({email})=>{
          authCalls.push(['signup',email]);
          await new Promise(resolve=>setTimeout(resolve,40));
          return {data:{session:null}};
        },
        signInWithPassword:async({email})=>{
          authCalls.push(['signin',email]);
          return {error:{code:'invalid_credentials'}};
        },
        resetPasswordForEmail:async(email,options)=>{
          authCalls.push(['reset',email,options.redirectTo]);
          return {data:{}};
        },
        updateUser:async()=>{
          authCalls.push(['newpass']);
          return {error:{code:'session_not_found'}};
        }
      }
    })};`
  }));
  await page.addInitScript(mode => localStorage.setItem('fat_mode',mode), recovery?'offline':'online');
  await page.goto('/index.html');
}

test('account creation keeps the confirmation visible and the reset uses the current origin', async ({ page }) => {
  await mockAuth(page);
  await page.clock.install();
  await page.evaluate(() => {
    landingStart();
    document.getElementById('authPass').focus();
  });
  await page.clock.runFor(100);
  await expect(page.locator('#authPass')).toBeFocused();
  await expect(page.locator('#snsAuthEnvironment')).toBeHidden();
  await page.locator('#authEmail').fill('owner@example.test');
  await page.locator('#authPass').fill('sale-demo-789');
  await page.locator('#authPass2').fill('sale-demo-789');
  await page.locator('#authConsent').check();
  await page.evaluate(() => Promise.all([authSubmit(),authSubmit()]));
  await expect(page.locator('#authMsg')).toContainText('رابط تأكيد الحساب');
  await expect(page.locator('#authPass2')).toBeHidden();
  expect(await page.evaluate(() => authCalls)).toEqual([['signup','owner@example.test']]);
  await page.locator('#authPass').fill('old');
  await page.locator('#authBtn').click();
  await expect(page.locator('#authMsg')).toContainText('راجع البريد الإلكتروني وكلمة المرور');
  await page.locator('#authForgot').click();
  await expect(page.locator('#authPass')).toBeHidden();
  await page.locator('#authBtn').click();
  await expect(page.locator('#authMsg')).toContainText('رابط إعادة التعيين');
  const url=new URL(page.url());
  expect(await page.evaluate(() => authCalls.at(-1))).toEqual(['reset','owner@example.test',url.origin+url.pathname]);
});

test('password recovery opens before the device mode and explains an expired link', async ({ page }) => {
  await mockAuth(page,true);
  await expect(page.locator('#authTtl')).toHaveText('كلمة مرور جديدة');
  await expect(page.locator('#authEmail')).toBeHidden();
  await page.locator('#authPass').fill('sale-demo-reset-489');
  await page.locator('#authBtn').click();
  await expect(page.locator('#authMsg')).toContainText('اطلب رابطًا جديدًا');
  expect(await page.evaluate(() => APP_STARTED)).toBe(false);
});
