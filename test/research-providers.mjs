import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {Webhook} from 'svix';
import {createSession,verifyEvent,createStripeSession,verifyStripeEvent} from '../build/providers/providers.js';
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
const session=await createSession(config,'opaque-challenge',async(url,init)=>{assert.equal(url,'https://edge.dashboard.self.xyz/v1/sessions');assert.equal(JSON.parse(init.body).externalUuid,'opaque-challenge');return Response.json({id:'session',status:'pending',externalUuid:'opaque-challenge',flowVersionId:'version',verificationUrl:'https://verify.self.xyz/s/verify_live_fixture',expiresAt:new Date(now+900000).toISOString()});});
assert.equal(session.id,'session');
await assert.rejects(()=>createSession(config,'opaque-challenge',async()=>Response.json({id:'session',status:'pending',externalUuid:'other',flowVersionId:'version',verificationUrl:'https://evil.example/s/verify_live_fixture',expiresAt:new Date(now+900000).toISOString()})));

// --- Stripe Identity Provider Verification Suite ---
const stripeConfig = { apiKey: 'rk_live_fixture_stripe_identity', verificationFlow: 'vf_doc_selfie', webhookSecret: 'whsec_stripe_test_secret' };
const stripeChallenge = { sessionId: 'vs_test_session', externalId: 'opaque-challenge', principal: 'did:key:alice', createdAt: now - 1000, expiresAt: now + 900000, consumed: false };
const stripeSession = await createStripeSession(stripeConfig, 'did:key:alice', 'opaque-challenge', async (url, init) => {
  assert.equal(url, 'https://api.stripe.com/v1/identity/verification_sessions');
  assert.equal(init.method, 'POST');
  assert.equal(init.headers['content-type'], 'application/x-www-form-urlencoded');
  assert.equal(init.headers['authorization'], 'Bearer rk_live_fixture_stripe_identity');
  assert.ok(init.body.includes('client_reference_id=opaque-challenge'));
  assert.ok(init.body.includes('metadata[principal]=did%3Akey%3Aalice'));
  return Response.json({ id: 'vs_test_session', client_reference_id: 'opaque-challenge', status: 'requires_input', url: 'https://verify.stripe.com/v/vs_test_session' });
});
assert.equal(stripeSession.id, 'vs_test_session');
assert.equal(stripeSession.verificationUrl, 'https://verify.stripe.com/v/vs_test_session');

const stripeEventObj = {
  id: 'evt_stripe_ident_123',
  type: 'identity.verification_session.verified',
  created: Math.floor(now / 1000),
  data: {
    object: {
      id: 'vs_test_session',
      status: 'verified',
      client_reference_id: 'opaque-challenge',
      metadata: { principal: 'did:key:alice' },
      verified_outputs: { first_name: 'Alice', last_name: 'Researcher', dob: { day: 1, month: 1, year: 1990 } }
    }
  }
};
const stripeRaw = JSON.stringify(stripeEventObj);
const stamp = Math.floor(now / 1000);
const stripeSig = `t=${stamp},v1=${createHmac('sha256', stripeConfig.webhookSecret).update(`${stamp}.${stripeRaw}`).digest('hex')}`;
const verifiedStripe = await verifyStripeEvent(stripeConfig, stripeChallenge, stripeRaw, stripeSig, now);
assert.equal(verifiedStripe.provider, 'stripe-identity');
assert.equal(verifiedStripe.status, 'verified');
assert.equal(verifiedStripe.reviewRequired, true);
assert.equal(verifiedStripe.verifiedOutputs.first_name, 'Alice');

console.log('Research provider transports: signature, environment, challenge, expiry and screening checks passed. Fixtures only; no real identity verified.');
