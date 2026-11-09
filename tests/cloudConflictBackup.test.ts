import assert from 'node:assert/strict';
import test from 'node:test';
import { readRecoverableCloudBackup, writeRecoverableCloudBackup, type CloudConflictBackup } from '../src/infrastructure/storage/cloudConflictBackup.ts';
import { markRecordSynced, markRecordLocallyEdited } from '../src/storage/recordSync.ts';
import { encodeStudyRecord } from '../src/storage/studyRecordCodec.ts';

class StorageBudget {
  values=new Map<string,string>();
  limit=Infinity;
  get length(){return this.values.size;}
  key(i:number){return [...this.values.keys()][i]??null;}
  getItem(key:string){return this.values.get(key)??null;}
  removeItem(key:string){this.values.delete(key);}
  used(){return [...this.values.values()].reduce((size,value)=>size+value.length,0);}
  setItem(key:string,value:string){
    if(this.used()-(this.values.get(key)?.length??0)+value.length>this.limit) throw new DOMException('full','QuotaExceededError');
    this.values.set(key,value);
  }
}
const prefix='study-v11:user:test:',key=prefix+'__cloud-conflict-backup__';
function backup():CloudConflictBackup {
  const cloud=markRecordSynced({schemaVersion:2,date:'2026-08-17',items:[],notes:'保留內容'.repeat(500),serverRevision:7});
  const local=markRecordLocallyEdited({...cloud,notes:'未同步的新筆記'},cloud);
  return {version:1,date:cloud.date,createdAt:'2026-11-09T00:00:00+08:00',local,cloud,resolvedRevision:null};
}
test('compact backup restores dirty history and confirmed baselines without modifying the source',()=>{
  const storage=new StorageBudget(),original=backup(),before=structuredClone(original);
  assert.equal(writeRecoverableCloudBackup(storage,key,original).ok,true);
  assert.deepEqual(readRecoverableCloudBackup(storage,key),before);
  assert.deepEqual(original,before);
  assert.ok(storage.getItem(key)!.length<JSON.stringify(before).length);
  const finished={...original,resolvedRevision:8};
  assert.equal(writeRecoverableCloudBackup(storage,key,finished).ok,true);
  assert.deepEqual(readRecoverableCloudBackup(storage,key),finished);
});
test('old full backups remain readable and invalid nested records cannot be restored',()=>{
  const storage=new StorageBudget(),original=backup();
  storage.setItem(key,JSON.stringify(original));
  assert.deepEqual(readRecoverableCloudBackup(storage,key),original);
  storage.setItem(key,JSON.stringify({...original,local:{...original.local,schemaVersion:999}}));
  assert.equal(readRecoverableCloudBackup(storage,key),null);
});
test('backup quota recovery only compacts redundant confirmed baselines and preserves other data',()=>{
  const storage=new StorageBudget(),original=backup();
  storage.setItem(prefix+'2026-08-16',encodeStudyRecord({...original.cloud!,date:'2026-08-16',syncBase:{...original.cloud!.syncBase!,date:'2026-08-16'}}));
  storage.setItem(prefix+'2026-08-17',encodeStudyRecord(original.local!));
  const dirty=storage.getItem(prefix+'2026-08-17');
  storage.setItem('other-service','keep');
  const old={...original,local:null,cloud:null};
  storage.setItem(key,JSON.stringify(old));
  storage.limit=storage.used()+JSON.stringify(original).length-original.cloud!.notes!.length-500;
  assert.equal(writeRecoverableCloudBackup(storage,key,original).ok,true);
  assert.deepEqual(readRecoverableCloudBackup(storage,key),original);
  assert.equal(storage.getItem(prefix+'2026-08-17'),dirty);
  assert.equal(storage.getItem('other-service'),'keep');
  assert.ok(storage.getItem(prefix+'2026-08-16')!.includes('same-content-v1'));
});
test('unrecoverable capacity preserves the existing backup and every record',()=>{
  const storage=new StorageBudget(),original=backup();
  storage.setItem(key,JSON.stringify({...original,local:null,cloud:null}));
  storage.setItem(prefix+'2026-08-17',encodeStudyRecord(original.local!));
  const before=[...storage.values.entries()];storage.limit=storage.used();
  const result=writeRecoverableCloudBackup(storage,key,original);
  assert.equal(result.ok,false);assert.match(result.reason,/本機儲存空間不足/);
  assert.deepEqual([...storage.values.entries()],before);
});
test('storage permission failures are distinguished from a full device',()=>{
  const storage=new StorageBudget();
  storage.setItem=()=>{throw new DOMException('denied','SecurityError');};
  const result=writeRecoverableCloudBackup(storage,key,backup());
  assert.equal(result.ok,false);assert.match(result.reason,/儲存權限/);assert.doesNotMatch(result.reason,/空間不足/);
});
