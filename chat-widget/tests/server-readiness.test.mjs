import test from 'node:test';
import assert from 'node:assert/strict';
import { waitForServer } from '../src/server-readiness.mjs';

test('a ready server proceeds after one lightweight health request', async () => {
    let calls=0;
    await waitForServer('https://example.test/health',{fetcher:async(url,options)=>{
        calls++;assert.match(url,/\/health$/);assert.equal(options.body,undefined);
        assert.equal(options.cache,'no-store');
        return {ok:true,json:async()=>({status:'ok'})};
    }});
    assert.equal(calls,1);
});
test('Render wake-up HTML and temporary 503 responses do not enable upload', async () => {
    let calls=0;
    await waitForServer('/health',{pollMs:1,timeoutMs:300,fetcher:async()=>{
        calls++;
        if(calls===1)return {ok:true,json:async()=>{throw SyntaxError('HTML wake-up page');}};
        if(calls===2)return {ok:false};
        return {ok:true,json:async()=>({status:'ok'})};
    }});
    assert.equal(calls,3);
});
test('unavailable servers produce a retryable error within the deadline', async () => {
    await assert.rejects(waitForServer('/health',{pollMs:1,timeoutMs:10,fetcher:async()=>({ok:false})}),/retry the connection/);
});
test('hung requests time out and cancellation stops polling', async () => {
    const hang=async(_url,{signal})=>new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(new DOMException('aborted','AbortError')),{once:true}));
    await assert.rejects(waitForServer('/health',{requestTimeoutMs:5,timeoutMs:20,pollMs:1,fetcher:hang}),/retry the connection/);
    const abort=new AbortController();
    const pending=waitForServer('/health',{signal:abort.signal,fetcher:hang});
    abort.abort();
    await assert.rejects(pending,{name:'AbortError'});
});
