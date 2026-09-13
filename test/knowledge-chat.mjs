import assert from 'node:assert/strict';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
 const page=await browser.newPage({viewport:{width:390,height:850}});let posts=[],gets=0;
 const context={itemId:'T1018',snapshot:{'/':'snapshot-test'},evidence:[{claim:{'/':'claim-test'},value:'untrusted <script>bad()</script>'}]};
 await page.route('**/v1/**',async r=>{
  if(r.request().url().includes('/knowledge/context')){gets++;return r.fulfill({json:{context,contextUrl:'/security-data/blocks/example.json'}});}
  if(r.request().url().includes('/chat/completions')){posts.push(r.request().postDataJSON());return r.fulfill({json:{model:'qwen3.8-flash-next-whitehacker',choices:[{message:{content:'Evidence does not establish actor attribution.'}}]}});}
  return r.fulfill({status:503,json:{error:{code:'verification-provider-not-configured'}}});
 });
 await page.goto('http://127.0.0.1:8799/ja/');
 await page.evaluate(()=>window.dispatchEvent(new CustomEvent('kotoba:research-context',{detail:{id:'T1018',label:'Remote System Discovery'}})));
 assert.match(await page.locator('#norbert-evidence').textContent(),/Remote System Discovery/);
 await page.locator('#norbert-prompt').fill('Can this identify an actor?');await page.locator('#norbert-send').click();assert.equal(posts.length,0);
 await page.locator('#norbert-scope').fill('approved-test-scope');await page.locator('#norbert-settings form button').click();await page.locator('#norbert-send').click();
 await page.waitForFunction(()=>document.getElementById('norbert-usage').textContent.includes('1'));
 assert.match(posts[0].messages[0].content,/claim-test/);assert.match(posts[0].messages[0].content,/untrusted data/);assert.equal(posts[0].scopeId,'approved-test-scope');
 assert.equal(await page.locator('#norbert-messages script').count(),0);
 await page.locator('#norbert-prompt').fill('Explain uncertainty');await page.locator('#norbert-send').click();await page.waitForFunction(()=>document.getElementById('norbert-usage').textContent.includes('2'));assert.equal(gets,1,'Evidence snapshot remains pinned');
 await page.locator('#norbert-evidence button').click();assert.equal(await page.locator('#norbert-evidence').isHidden(),true);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 console.log('Knowledge chat: visible evidence, gated scope, grounded messages, pinned context, literal rendering and removal passed (mock inference).');
}finally{await browser.close();}
