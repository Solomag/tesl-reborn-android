const fs=require('fs'),vm=require('vm'),assert=require('assert/strict'),{transformSync}=require('esbuild');
const hook=fs.readFileSync('hook.ts','utf8'),start=hook.indexOf('  function newWith('),end=hook.indexOf('  function isNull(',start);
const c={};vm.createContext(c);
vm.runInContext(transformSync(hook.slice(start,end)+require('./source.cjs')('ui-common'),{loader:'ts'}).code,c);
let count=0,ctorFails=false;
function object(name){const o={name,roots:0,handle:{isNull:()=>false},ref(){o.roots++;count++;return{target:o,free(){assert(o.roots>0);o.roots--;count--;}};}};return o;}
const go=object('go');go.method=()=>({invoke(){assert(go.roots>0,'constructor receiver must be retained');if(ctorFails)throw Error('ctor failure');}});
const klass={alloc:()=>go};assert.equal(c.newWith(klass,'arg'),go);assert.equal(count,0);
ctorFails=true;assert.throws(()=>c.newWith(klass),/ctor failure/);assert.equal(count,0);ctorFails=false;

const type={object:{}},parent=object('parent');
c.Il2Cpp={string:x=>x,array:()=>[],corlib:{class:()=>({})}};
c.ucls=()=>({type,alloc:()=>go});
c.call=(o,n)=>{assert(go.roots>0,'new UI object must survive parenting allocations');
  if(n==='get_layer')return 5;if(n==='get_gameObject')return parent;
  if(n==='get_transform')return{method:()=>({overload(){return this;},invoke(){assert(go.roots>0);}})};
};
assert.equal(c.uiNew('new',parent),go);assert.equal(count,0);

const label=object('label');c.uiAdd=()=>label;c.uiEnum=()=>0;c.rgba=()=>({});
const findFont=c.uiFont;c.uiFont=()=>{assert(label.roots>0,'text must survive cold font discovery');return object('font');};
c.call=(o)=>{assert(o.roots>0,'text must be retained until configuration completes');};
assert.equal(c.uiText(go,'hello'),label);assert.equal(count,0);
c.uiFont=()=>{throw Error('font failure');};assert.throws(()=>c.uiText(go,'hello'),/font failure/);assert.equal(count,0);

const font=object('font'),texts=object('array');texts.length=1;texts.get=()=>label;
c.ucls=()=>({type,method:()=>({overload(){return this;},invoke:()=>({object:texts,length:1,get:()=>label})})});
c.call=(o,n)=>{assert(texts.roots>0,'font enumeration array must be retained');if(n==='get_font')return font;if(n==='get_name')return{content:'Merriweather'};};
c.isNull=x=>x==null;assert.equal(findFont(),font);assert.equal(texts.roots,0);assert.equal(font.roots,1,'only cached font retained');
console.log('PASS: constructor, parenting, cold text/font discovery and exceptional exits retain managed objects and free temporary roots');
