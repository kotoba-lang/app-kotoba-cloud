import assert from 'node:assert/strict';
import {Webhook} from 'svix';
import {createSession,verifyEvent,infer} from '../build/providers/providers.js';
const now=Date.now(), secret='whsec_'+Buffer.alloc(32,7).toString('base64');
const config={apiKey:'sk_live_fixture',flowId:'flow',flowVersionId:'version',webhookSecret:secret};
const challenge={sessionId:'session',externalId:'opaque-challenge',createdAt:now-1000,expiresAt:now+900000,consumed:false};
const event={type:'verification.completed',environment:'live',status:'valid',product:'pre_kyc',flow_id:'flow',flow_version_id:'version',verification_id:'session',external_uuid:'opaque-challenge',verified_at:new Date(now).toISOString(),verification_mode:'backend',proof_attributes:{minimumAge:18,ofac:true},nullifier:'scope-person'};
function envelope(value) {const raw=JSON.stringify(value),id='msg_fixture',date=new Date();return {raw,headers:{'svix-id':id,'svix-timestamp':String(Math.floor(date.getTime()/1000)),'svix-signature':new Webhook(secret).sign(id,date,raw)}};}
const signed=envelope(event);
assert.equal(verifyEvent(config,challenge,signed.raw,signed.headers,now).reviewRequired,true);
const legacyBackend={...event};delete legacyBackend.verification_mode;const backendSigned=envelope(legacyBackend);assert.equal(verifyEvent(config,challenge,backendSigned.raw,backendSigned.headers,now).reviewRequired,true);
for(const patch of [{environment:'test'},{status:'invalid'},{product:'age_verification'},{flow_version_id:'other'},{external_uuid:'other'},{nullifier:null},{proof_attributes:{ofac:false,minimumAge:18}},{proof_attributes:{ofac:true,minimumAge:0}},{verification_mode:'onchain'}]) {
 const e=envelope({...event,...patch});assert.throws(()=>verifyEvent(config,challenge,e.raw,e.headers,now));
}
assert.throws(()=>verifyEvent(config,{...challenge,consumed:true},signed.raw,signed.headers,now));
assert.throws(()=>verifyEvent(config,{...challenge,expiresAt:now},signed.raw,signed.headers,now));
assert.throws(()=>verifyEvent(config,challenge,signed.raw+' ',signed.headers,now));
assert.throws(()=>verifyEvent({...config,apiKey:'sk_test_fixture'},challenge,signed.raw,signed.headers,now));
const model='qwen3.8-flash-next-whitehacker', upstreamModel='qwen3.8-flash-next-cybersecurity-nvfp4';
const request={model,scopeId:'approved-scope',task:'code-review',max_tokens:128,messages:[{role:'user',content:'Review my code.'}]};
let calls=0;
const result=await infer(request,async(url,init)=>{calls++;assert.equal(url,'https://api.murakumo.cloud/v1/chat/completions');assert.equal(init.redirect,'error');const body=JSON.parse(init.body);assert.deepEqual(Object.keys(body).sort(),['max_tokens','messages','model','stream']);assert.equal(body.model,upstreamModel);return Response.json({model:upstreamModel,object:'chat.completion',choices:[{message:{content:'Bind SQL parameters.'},finish_reason:'stop'}]});});
assert.equal(result.model,model);assert.equal(calls,1);
await assert.rejects(()=>infer(request,async()=>Response.json({model:'fallback-model',object:'chat.completion',choices:[{message:{content:'Unexpected'}}]})));
await assert.rejects(()=>infer(request,async()=>new Response('',{status:503})));
assert.throws(()=>infer({...request,model:'other'},()=>{throw Error('must not call')}));
const session=await createSession(config,'opaque-challenge',async(url,init)=>{assert.equal(url,'https://edge.dashboard.self.xyz/v1/sessions');assert.equal(JSON.parse(init.body).externalUuid,'opaque-challenge');return Response.json({id:'session',status:'pending',externalUuid:'opaque-challenge',flowVersionId:'version',verificationUrl:'https://verify.self.xyz/s/verify_live_fixture',expiresAt:new Date(now+900000).toISOString()});});
assert.equal(session.id,'session');
await assert.rejects(()=>createSession(config,'opaque-challenge',async()=>Response.json({id:'session',status:'pending',externalUuid:'other',flowVersionId:'version',verificationUrl:'https://evil.example/s/verify_live_fixture',expiresAt:new Date(now+900000).toISOString()})));
console.log('Research provider transports: signature, environment, challenge, expiry, screening and model attribution checks passed. Fixtures only; no real identity verified.');
