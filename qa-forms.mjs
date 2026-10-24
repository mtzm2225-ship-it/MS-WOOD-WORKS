export default async function run(page) {
  // go to contact form
  await page.goto('http://127.0.0.1:3000/#contact');
  await page.waitForTimeout(1500);
  await page.fill('#cf-name', 'مستخدم تجربة');
  await page.fill('#cf-phone', '01000000001');
  await page.fill('#cf-msg', 'أريد مكتب خشبي حسب الطلب بمقاس 200 سم');
  await page.click('#contactForm button[type=submit]');
  await page.waitForTimeout(2500);
  const note = await page.textContent('#formNote');

  // test customer register
  await page.click('#customerAccountOpen');
  await page.waitForTimeout(1000);
  await page.click('#showCustomerRegister');
  await page.fill('#customerName', 'عميل تجربة');
  await page.fill('#customerEmail', `qa${Date.now()}@test.com`);
  await page.fill('#customerPhone', '01000000002');
  await page.fill('#customerPassword', 'TestPass123456');
  await page.click('#customerRegisterForm button[type=submit]');
  await page.waitForTimeout(2500);
  const regNote = await page.textContent('#customerRegisterNote');
  const accName = await page.textContent('#customerAccountName').catch(() => 'N/A');

  // test review form
  await page.evaluate(() => document.getElementById('customerReviewForm').scrollIntoView());
  await page.selectOption('#reviewProject', { index: 1 });
  await page.fill('#reviewName', 'عميل تجربة');
  await page.fill('#reviewBody', 'تجربة رأي من الاختبار الآلي');
  await page.$eval('#customerReviewForm button[type=submit]', (b) => b.click());
  await page.waitForTimeout(2500);
  const reviewNote = await page.textContent('#customerReviewNote');

  return { orderNote: note, regNote, accName, reviewNote };
}
