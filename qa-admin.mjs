export default async function run(page) {
  await page.fill('#adminEmail', 'demo-admin@local.test');
  await page.fill('#adminPassword', 'WoodDemo!Admin-2026');
  await page.click('#loginForm button[type=submit]');
  await page.waitForTimeout(4000);
  const text = await page.textContent('body');
  return { text: text.slice(0, 1500) };
}
