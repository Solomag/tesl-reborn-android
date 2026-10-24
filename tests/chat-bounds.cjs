const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
function fixture(version,missingSetter=false){
 let uid=0;const objects=[],logs=[];
 const v=(x,y)=>({x,y,field(n){return {value:this[n]}}});
 class Obj{
  constructor(name){this.name=name;this.handle={toString:()=>name+this.id};this.id=uid++;this.p={anchorMin:v(.5,.5),anchorMax:v(.5,.5),pivot:v(.5,.5),sizeDelta:v(100,100),anchoredPosition:v(0,0)};this.fields={};objects.push(this);}
  field(n){const self=this;return {get value(){return self.fields[n]},set value(x){self.fields[n]=x;}};}
  ref(){return {target:this,free(){}};}weakRef(){return this.ref();}
  tryMethod(n){return n==='GetPreferredValues'||n==='set_autoSizeTextContainer'&&!missingSetter?this.method(n):null;}
  method(n){return {invoke:(...a)=>this.invoke(n,a),overload:()=>({invoke:(...a)=>this.invoke(n,a)})};}
  width(){return this.root?this.w:(this.p.anchorMax.x-this.p.anchorMin.x)*(this.parent?.width()||0)+this.p.sizeDelta.x;}
  height(){return this.root?this.h:(this.p.anchorMax.y-this.p.anchorMin.y)*(this.parent?.height()||0)+this.p.sizeDelta.y;}
  invoke(n,a){
   if(n==='get_gameObject')return this.go||this;if(n==='get_transform')return this;
   if(n==='get_parent')return this.parent;if(n==='get_rectTransform')return this.go;
   if(n==='get_rect')return {field:k=>({value:k==='m_Width'?this.width():this.height()})};
   if(n==='GetPreferredValues')return v(a[1],57);
   if(n==='set_sizeDelta'){if(this.root){this.w+=a[0].x-this.p.sizeDelta.x;this.h+=a[0].y-this.p.sizeDelta.y;}this.p.sizeDelta=a[0];return;}
   if(n==='set_offsetMin'){this.p.offsetMin=a[0];return;}
   if(n==='set_offsetMax'){this.p.offsetMax=a[0];this.p.sizeDelta=v(a[0].x-this.p.offsetMin.x,a[0].y-this.p.offsetMin.y);return;}
   if(n.startsWith('set_')){this.p[n.slice(4)]=a[0];return;}
   if(n.startsWith('get_'))return this.p[n.slice(4)];
   throw Error(n);
  }
 }
 const rowGO=new Obj('Row');rowGO.root=true;rowGO.w=1940.2;rowGO.h=24;rowGO.p.sizeDelta=v(1940.2,24);rowGO.p.activeInHierarchy=true;rowGO.parent=new Obj('Content');
 const group=new Obj('Group'),legacy=new Obj('Input'),template=new Obj('Text');legacy.p.textComponent=template;
 const row=new Obj('RowComponent');row.go=rowGO;row.fields._input=legacy;
 const c={Map,Number,Math,section:()=>{},schedule:()=>{},ucls:()=>({}),enumBox:(_,n)=>n,uiEnum:()=>257,
  isNull:x=>x==null,log:s=>logs.push(s),initializeEmojis:()=>true,emojiAsset:{},uiPlain:s=>s,emojiFormat:s=>s,
  Il2Cpp:{string:s=>s},vec2:v,uiXY:a=>({x:a.x,y:a.y}),call:(o,n,...a)=>o.method(n).invoke(...a),
  uiNew:(name,parent)=>{const o=new Obj(name);o.parent=parent;return o;},uiRect:o=>o,
  uiStretch:o=>{o.p.anchorMin=v(0,0);o.p.anchorMax=v(1,1);o.p.sizeDelta=v(0,0);o.p.anchoredPosition=v(0,0);},
  uiAdd:()=>new Obj('Layout'),uiComponent:(go,type)=>go===rowGO.parent&&type==='UnityEngine.UI.VerticalLayoutGroup'?group:null,
  uiText:(go,text)=>{
   // Reproduce the +200,+50 container reset observed in the Android log.
   go.p.sizeDelta=v(200,50);go.p.anchoredPosition=v(0,0);
   const label=new Obj('TMP');label.go=go;label.p.text=text;return label;
  }};
 vm.createContext(c);let source=require('./source.cjs')('chat-emojis');
 source=source.slice(source.indexOf('  const chatMessages'),source.indexOf('  section("chat emoji rendering"'));
 vm.runInContext(source,c);
 c.renderChatMessage(row,{field:n=>({value:{content:n==='Username'?'Solo_mag-OTK':'Hello :smile:'}})});
 return {c,rowGO,go:objects.find(o=>o.name==='RebornEmojiMessage'),label:objects.find(o=>o.name==='TMP'),v};
}
for(const missingSetter of [false,true]){
 const next=fixture(17,missingSetter);
 assert(Math.abs(next.go.width()-1924.2)<.001);assert.equal(next.go.height(),57);
 assert.equal((next.rowGO.width()-next.go.width())/2,8);
 assert.equal(next.label.p.text,'<b>Solo_mag-OTK</b>\nHello :smile:');
 if(!missingSetter)assert.equal(next.label.p.autoSizeTextContainer,false);
 else assert.equal(next.label.fields.m_autoSizeTextContainer,false);
 next.go.p.sizeDelta=next.v(200,50);next.c.chatRefreshMessageSizes();
 assert(Math.abs(next.go.width()-1924.2)<.001);assert.equal(next.go.height(),57,'late native reset must also be repaired');
 next.rowGO.w=800;next.c.chatRefreshMessageSizes();assert.equal(next.go.width(),784,'stretch remains correct when parent width changes');
}
console.log('PASS: current source gives 1924.2x57 with 8px inset, optional setter fallback and late reset repair');
