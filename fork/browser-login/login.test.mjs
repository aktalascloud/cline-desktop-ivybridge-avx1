import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PassThrough} from 'node:stream';
import {ORIGIN,PipeRpc,validSession} from './login.mjs';
test('session scope rejects foreign origins, missing and invalid tokens',()=>{
 assert.ok(validSession({origin:ORIGIN,token:'fixture'}));
 for(const value of [null,{}, {origin:'https://evil.invalid',token:'fixture'},{origin:ORIGIN,token:''},{origin:ORIGIN,token:'a\nb'},{origin:ORIGIN,token:'x'.repeat(16385)}])assert.ok(!validSession(value));
});
test('private pipe accepts partial frames and ignores unrelated events',async()=>{
 const write=new PassThrough(),read=new PassThrough(),rpc=new PipeRpc(write,read);
 const pending=rpc.call('Browser.getVersion');read.write('{"method":"Target.event"}\0{"id":1,"result":');read.write('{"product":"fixture"}}\0');
 assert.deepEqual(await pending,{product:'fixture'});rpc.close();
});
test('pipe errors never reflect remote content',async()=>{
 const write=new PassThrough(),read=new PassThrough(),rpc=new PipeRpc(write,read);const pending=rpc.call('Browser.getVersion');read.write('{"id":1,"error":{"message":"private-fixture"}}\0');
 await assert.rejects(pending,error=>!error.message.includes('private-fixture'));rpc.close();
});
test('closing a pipe rejects pending calls',async()=>{
 const rpc=new PipeRpc(new PassThrough(),new PassThrough());const pending=rpc.call('Browser.getVersion');rpc.close();await assert.rejects(pending,/closed/);
});
