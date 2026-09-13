import assert from 'node:assert/strict';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser=await chromium.launch({channel:'chrome',headless:true});
try {
 const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 let submitted=[],fail=false;
 await page.route('**/v1/**',async route=>{
  if(route.request().url().endsWith('/chat/completions')){
   submitted.push(route.request().postDataJSON());
   await route.fulfill({status:fail?401:200,contentType:'application/json',body:JSON.stringify(fail?{error:{code:'sign-in-required'}}:{model:'kotoba/norbert',choices:[{message:{content:'Use parameterized SQL. <script>unsafe()</script>'}}]})});
  }else await route.fulfill({status:401,contentType:'application/json',body:'{}'});
 });
 for(const width of [320,390,768,1440]) {
  await page.setViewportSize({width,height:850});await page.goto(process.env.CHAT_URL || 'http://127.0.0.1:8799/ja/');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.locator('#norbert-prompt').fill('Review my SQL');await page.locator('#norbert-send').click();
  await page.locator('#norbert-scope').fill('approved-test-scope');await page.locator('#norbert-settings form button').click();
  await page.locator('#norbert-send').click();await page.waitForFunction(()=>document.getElementById('norbert-usage').textContent.includes('1'));
  assert.equal(submitted.at(-1).model,'kotoba/norbert');
  assert.equal(await page.locator('#norbert-messages script').count(),0);
  await page.locator('#norbert-prompt').fill('Explain');await page.locator('#norbert-send').click();await page.waitForFunction(()=>document.getElementById('norbert-usage').textContent.includes('2'));
  assert.equal(submitted.at(-1).messages.length,3);
  if(width<768)await page.locator('#norbert-menu').click();
  await page.locator('#norbert-new').click();assert.equal(await page.locator('#norbert-messages article').count(),0);
  if(width<768)await page.locator('#norbert-menu').click();
  await page.locator('#norbert-history button').filter({hasText:'Review my SQL'}).click();
  assert.equal(await page.locator('#norbert-messages article').count(),4);
  assert.equal(await page.locator('#norbert-scope').inputValue(),'approved-test-scope');
  fail=true;await page.locator('#norbert-prompt').fill('Retry me');await page.locator('#norbert-send').click();
  await page.waitForFunction(()=>document.getElementById('norbert-status').textContent.includes('ログイン'));
  assert.equal(await page.locator('#norbert-prompt').inputValue(),'Retry me');
  assert.equal(await page.locator('#norbert-messages article').count(),4);fail=false;
 }
 assert.deepEqual(errors,[]);console.log('Norbert chat: responsive layout, scope gating, literal rendering, context, history and failure recovery passed. Mock responses only.');
}finally{await browser.close();}
