const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
let uid=0,assetsReady=true;const created=[],logs=[];
const v=(x,y)=>({x,y,field(n){return {value:this[n]}}});
class Obj{
 constructor(name){this.name=name;this.id=uid++;this.handle={toString:()=>name+this.id};this.p={sizeDelta:v(100,100),anchorMin:v(.5,.5),anchorMax:v(.5,.5),activeInHierarchy:true};this.fields={};}
 field(n){return {value:this.fields[n]??null};}
 ref(){return {target:this,free(){}};}weakRef(){this.weak=this.ref();return this.weak;}
 tryMethod(n){return n==='set_autoSizeTextContainer'?this.method(n):null;}
 method(n){return {parameters:[{type:{class:{name:'TextOverflowModes'}}}],invoke:(...a)=>this.invoke(n,a)};}
 width(){return this.widthValue??((this.p.anchorMax.x-this.p.anchorMin.x)*(this.parent?.width()||0)+this.p.sizeDelta.x);}
 height(){return this.heightValue??((this.p.anchorMax.y-this.p.anchorMin.y)*(this.parent?.height()||0)+this.p.sizeDelta.y);}
 invoke(n,a){
  if(n==='get_transform'||n==='get_gameObject')return this.go||this;
  if(n==='get_rectTransform')return this.go||this;
  if(n==='get_rect')return {field:k=>({value:k==='m_Width'?this.width():this.height()})};
  if(n==='get_canvasRenderer')return this.renderer||(this.renderer=new Obj('Renderer'));
  if(n==='get_text')return {content:this.p.text};
  if(n==='GetColor')return {r:1,g:1,b:1,a:.35};if(n==='SetColor'){this.p.rendererColor=a[0];return;}
  if(n.startsWith('get_'))return this.p[n.slice(4)];
  if(n.startsWith('set_')){this.p[n.slice(4)]=a[0];return;}
  throw Error(n);
 }
}
const template=new Obj('LegacyPreview');template.widthValue=320;template.heightValue=80;
Object.assign(template.p,{text:'<b>Solo</b> <color=#888888>20:12</color>\n:smile:',fontSize:18,supportRichText:true,color:{r:.86,g:.86,b:.86,a:1},alignment:3,horizontalOverflow:0,enabled:true});
const row=new Obj('PreviewRow');row.fields._text=template;
const c={Map,Set,Number,Math,String,Il2Cpp:{string:s=>s},isNull:x=>x==null,enumVal:x=>x,enumBox:(_,n)=>n,
 vec2:v,uiPlain:s=>String(s).replace(/</g,'‹').replace(/>/g,'›'),initializeEmojis:()=>assetsReady,
 uiEnum:(_,name)=>name,section:()=>{},log:s=>logs.push(s),call:(o,n,...a)=>o.method(n).invoke(...a),
 uiNew:(name,parent)=>{const go=new Obj(name);go.parent=parent;created.push(go);return go;},uiRect:go=>go,
 uiAdd:()=>new Obj('Layout'),uiText:(go,text)=>{go.p.sizeDelta=v(200,50);const label=new Obj('TMP');label.go=go;label.p.text=text;created.push(label);return label;},
 ucls:()=>({method:()=>({overload:()=>({invoke:o=>{o.destroyed=true;}})})})};
vm.createContext(c);
const source=require('./source.cjs')('chat-emojis');
vm.runInContext(source.slice(0,source.indexOf('  function initializeEmojis')),c);
vm.runInContext("emojiAsset={atlas:true};emojiByName.set('smile',{index:2});emojiByName.set('joy',{index:7});emojiByAscii.set(':D','smile');",c);
vm.runInContext(require('./source.cjs')('message-preview'),c);
assert.equal(c.emojiPreviewFormat('<b>Solo</b> :smile:',true),'<b>Solo</b> <size=130%><sprite=2></size>');
assert.equal(c.emojiPreviewFormat('<b>Solo</b> :smile:',false),'‹b›Solo‹/b› <size=130%><sprite=2></size>');
assert.equal(c.emojiPreviewFormat('<link="emoji+joy"><sprite=7></link>',true),'<size=130%><sprite=7></size>');
assert.equal(c.emojiPreviewFormat(':D',true),'<size=130%><sprite=2></size>');
assert.equal(c.emojiPreviewFormat(':unknown:',true),':unknown:');
const message={field:n=>({value:{content:n==='Username'?'Solo':'private body'}})};
c.renderMessagePreview(row,message);
const go=created.find(x=>x.name==='PreviewRichText'),label=created.find(x=>x.name==='TMP');
assert.equal(go.parent,template);assert.equal(go.width(),320);assert.equal(go.height(),80,'post-TMP bounds must cancel default +200,+50');
assert.equal(label.p.autoSizeTextContainer,false);assert.equal(label.p.fontSize,18);assert.equal(label.p.alignment,'Left');
assert.equal(label.p.overflowMode,3);assert.equal(label.p.enableWordWrapping,true);assert.equal(label.p.raycastTarget,true);
assert(label.p.text.includes('20:12'));assert(label.p.text.includes('<sprite=2>'));assert(label.p.spriteAsset.atlas);
assert.equal(template.p.enabled,false);assert.equal(template.p.activeInHierarchy,true,'original preview GameObject must stay active');
assert.equal(label.renderer.p.rendererColor.a,.35,'preserve native preview fade');
template.p.text='<b>Solo</b> 20:13\n:joy:';c.renderMessagePreview(row,message);
assert.equal(created.filter(x=>x.name==='PreviewRichText').length,1);assert(label.p.text.includes('<sprite=7>'));
template.p.text='Late :smile:';go.p.sizeDelta=v(200,50);c.refreshMessagePreviews();
assert(label.p.text.includes('<sprite=2>'));assert.equal(go.width(),320);assert.equal(go.height(),80);
row.weak.target=null;c.refreshMessagePreviews();assert(go.destroyed);assert.equal(template.p.enabled,true);
assetsReady=false;const row2=new Obj('RowWithoutAssets');row2.fields._text=template;c.renderMessagePreview(row2,message);
assert.equal(template.p.enabled,true);assert.equal(created.filter(x=>x.name==='PreviewRichText').length,1);
vm.runInContext('emojiAsset=null',c);
let initCalls=0;c.initializeEmojis=()=>{initCalls++;return false;};
const oldClass=c.ucls;c.ucls=name=>name==='UnityEngine.Shader'?{method:()=>({invoke:()=>null})}:oldClass(name);
c.renderMessagePreview(row2,message);assert.equal(initCalls,0,'early preview without shader must not consume chat initialization');
assert(!logs.join('\n').includes('private body'));
console.log('PASS: preview sprites and PC markup, native name/time/style/font/colour/fade, clipping, post-TMP bounds, reuse, late updates, cleanup and missing-asset fallback');
