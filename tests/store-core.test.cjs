const assert=require('node:assert/strict');
const fs=require('node:fs');const vm=require('node:vm');const {webcrypto}=require('node:crypto');
const memory=new Map();const sandbox={crypto:webcrypto,TextEncoder,URL,localStorage:{getItem:k=>memory.get(k)||null,setItem:(k,v)=>memory.set(k,v),removeItem:k=>memory.delete(k)}};
vm.createContext(sandbox);vm.runInContext(fs.readFileSync('store-core.js','utf8')+';this.core=NadiaStore;',sandbox);const core=sandbox.core;
(async()=>{
 const products=[{id:'one',slug:'one',stock:3,price:100,active:true},{id:'hidden',slug:'hidden',stock:2,price:20,active:false},{id:'unpriced',slug:'unpriced',stock:4,price:null}];
 assert.equal(core.purchasable(products[2]),false);assert.equal(core.purchasable(products[1]),false);
 const clean=core.reconcile([{slug:'one',qty:9},{slug:'one',qty:2},{slug:'gone',qty:1},{slug:'hidden',qty:1},{slug:'unpriced',qty:1}],products);
 assert.equal(JSON.stringify(clean),JSON.stringify([{slug:'one',qty:3}]));
 const a=await core.requestId('order',{items:[1],name:'Test'}),b=await core.requestId('order',{items:[1],name:'Test'}),c=await core.requestId('order',{items:[2],name:'Test'});
 assert.equal(a,b);assert.notEqual(a,c);assert(!memory.get('nadia_pending_order').includes('Test'));
 sandbox.localStorage.getItem=()=>{throw Error('Blocked')};assert.equal(core.read('x','fallback'),'fallback');
 assert.match(core.error({message:'INSUFFICIENT_STOCK'},false),/Stock changed/);
 assert.equal(core.httpsUrl('javascript:alert(1)'),false);assert.equal(core.imageUrl('javascript:alert(1)'),false);
 console.log('PASS: purchasability, stale carts, quantity caps, idempotency, storage failure, safe URLs, customer errors');
})().catch(e=>{console.error(e);process.exitCode=1});
