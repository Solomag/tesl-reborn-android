const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
let touches=[],mouse={point:{x:0,y:0},down:false,held:false};const saves=[],logs=[];
const value=o=>({field:n=>({value:o[n]})});
const windowRect={scale:{x:1,y:1,z:1}},handle={};
const c={Number,Math,JSON,enumVal:x=>x,uiXY:o=>o.position||o,unityStruct:(_,o)=>o,
 persistentPath:()=>'/app/files',writeTextFile:(p,s)=>saves.push(JSON.parse(s)),log:s=>logs.push(s),chatScreen:()=>({width:1280,height:720}),
 chatContains:(rect,point)=>rect===windowRect?point.x>=0&&point.x<=1280&&point.y>=0&&point.y<=720:point.x>1200&&point.y<40,
 call:(o,n,...a)=>{if(n==='get_worldCamera')return null;if(n==='get_localScale')return value(o.scale);if(n==='set_localScale'){o.scale=a[0];return;}throw Error(n);},
 ucls:()=>({method:n=>({invoke:i=>n==='get_touchCount'?touches.length:n==='GetTouch'?{method:k=>({invoke:()=>k==='get_position'?touches[i].point:touches[i].phase})}:
  n==='get_mousePosition'?mouse.point:n==='GetMouseButtonDown'?mouse.down:mouse.held})})};
vm.createContext(c);vm.runInContext(require('./source.cjs')('chat-scale'),c);
const r={scaleEnabled:true,rect:{target:windowRect},canvas:{target:{}},baseScale:{x:1,y:1,z:1},factor:1,maxFactor:1.6,dragging:true,armed:true};
touches=[{point:{x:400,y:300},phase:0},{point:{x:500,y:300},phase:0}];assert(c.chatScaleUpdate(r));assert.equal(r.dragging,false);
touches[1]={point:{x:600,y:300},phase:1};c.chatScaleUpdate(r);assert.equal(r.factor,1.6);assert.equal(windowRect.scale.x,1.6);
touches[1].phase=3;c.chatScaleUpdate(r);assert.equal(saves.length,1);
touches=[];assert.equal(c.chatScaleUpdate(r),false,'single pointer must be left for chat dragging');
c.chatScaleSet(r,-4);assert.equal(r.factor,.45);assert.equal(windowRect.scale.y,.45);
windowRect.scale={x:1,y:1,z:1};c.chatScaleApply(r);assert.equal(windowRect.scale.x,.45,'native scale reset must be repaired');
console.log('PASS: two-finger pinch without corner control, bounded uniform scaling, persistence and native reset');
