import { createOAuthState, verifyOAuthState, authenticatedUser } from '../functions/_shared/googleCalendar.ts';
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.114.0';

function assert(value: unknown,message='assertion failed'): void { if (!value) throw new Error(message); }
const userId='00000000-0000-0000-0000-000000000154';
const clientId='123456-test.apps.googleusercontent.com';
function fixture() {
  const issued=new Map<string,{user:string;client:string}>();
  const calls:string[]=[];
  const admin={async rpc(name:string,args:Record<string,unknown>) {
    calls.push(name);
    if(name==='calendar_oauth_nonce_issue') { issued.set(String(args.p_nonce),{user:String(args.p_user_id),client:String(args.p_client_id)}); return {data:null,error:null}; }
    const nonce=String(args.p_nonce),row=issued.get(nonce);
    const valid=Boolean(row && row.user===args.p_user_id && row.client===args.p_client_id);
    if(valid)issued.delete(nonce);
    return {data:valid,error:null};
  }} as unknown as SupabaseClient;
  return {admin,issued,calls};
}
function configure() {
  for(const [key,value] of Object.entries({GOOGLE_CLIENT_SECRET:'test-only-client-secret',GOOGLE_STATE_SECRET:'test-only-state-secret-with-enough-entropy',GOOGLE_REDIRECT_URI:'https://test.invalid/callback',APP_RETURN_URL:'https://test.invalid/'}))Deno.env.set(key,value);
  Deno.env.delete('GOOGLE_CLIENT_ID');
}

Deno.test('signed OAuth state consumes its exact server nonce and cannot be replayed',async()=>{
  configure(); const {admin,issued}=fixture();
  const state=await createOAuthState(userId,clientId,admin);
  assert(issued.size===1);
  const result=await verifyOAuthState(state,admin);
  assert(result.userId===userId && result.clientId===clientId);
  assert(issued.size===0);
  let replayed=false;
  try { await verifyOAuthState(state,admin); replayed=true; } catch { /* rejected */ }
  assert(!replayed,'one-use state was replayed');
});

Deno.test('tampering, malformed signatures and expiration do not consume a valid OAuth nonce',async()=>{
  configure(); const {admin,issued,calls}=fixture();
  const state=await createOAuthState(userId,clientId,admin);
  for(const bad of [state+'.extra',state.replace(/^./,state[0]==='A'?'B':'A'),'x'.repeat(4097)]) {
    let accepted=false; try {await verifyOAuthState(bad,admin);accepted=true;}catch{/*rejected*/}
    assert(!accepted); assert(issued.size===1);
  }
  const original=Date.now;
  Date.now=()=>original()+16*60_000;
  try {let accepted=false;try{await verifyOAuthState(state,admin);accepted=true;}catch{/*rejected*/}assert(!accepted);}
  finally{Date.now=original;}
  assert(calls.filter(name=>name==='calendar_oauth_nonce_consume').length===0);
});

Deno.test('Calendar authorization requires a verified registered Auth user',async()=>{
  const request=(token='')=>new Request('https://test.invalid',{headers:token?{authorization:`Bearer ${token}`}:{}});
  const admin={auth:{async getUser(){return{data:{user:{id:userId,is_anonymous:false}},error:null};}}} as unknown as SupabaseClient;
  assert(await authenticatedUser(request('test-only-jwt'),admin)===userId);
  for(const invalid of [request(),request('invalid')]) {
    const bad={auth:{async getUser(){return{data:{user:{id:userId,is_anonymous:true}},error:null};}}} as unknown as SupabaseClient;
    let accepted=false;try{await authenticatedUser(invalid,bad);accepted=true;}catch{/*rejected*/}assert(!accepted);
  }
});
