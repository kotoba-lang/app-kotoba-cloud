import assert from 'node:assert/strict';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
 const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 for(const width of [320,390,768,1440]){
  await page.setViewportSize({width,height:850});await page.goto((process.env.SITE_URL||'http://127.0.0.1:8799')+'/ja/#security');
  await page.waitForFunction(()=>document.getElementById('security-summary').textContent.includes('241'));
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  assert.equal(await page.locator('#chat-view').isVisible(),false);
  await page.locator('#security-search').fill('');await page.locator('#security-kind').selectOption('attack-log');await page.locator('#security-results button').click();
  await page.locator('#security-detail').getByRole('link',{name:'監査ログを読む'}).waitFor();
  await page.locator('#security-detail').getByRole('button',{name:'maps-to · T1018 — Remote System Discovery'}).click();
  await page.locator('#security-detail h2').filter({hasText:'T1018'}).waitFor();
  await page.locator('#security-search').fill('<script>alert(1)</script>');assert.equal(await page.locator('#security-results button').count(),0);
  await page.locator('#security-view nav a').first().click();await page.locator('#chat-view').waitFor({state:'visible'});
 }
 assert.deepEqual(errors,[]);console.log('Security UI: mobile layouts, corpus filtering, evidence links, graph traversal, literal search and return to chat passed.');
}finally{await browser.close();}
