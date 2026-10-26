const vm=require('vm'),assert=require('assert/strict'),{transformSync}=require('esbuild');
const v=values=>({field:key=>({value:values[key]})});const splash={field:()=>({value:'logo'})};let finds=0;
const c={img:{},cls:()=>({type:{object:'SplashWin'}}),chatScreen:()=>({width:2000,height:1000}),unityStruct:(name,values)=>values,log:()=>{},
 ucls:name=>({method:()=>name==='UnityEngine.Resources'?{overload:()=>({invoke:()=>{finds++;return{length:1,get:()=>splash};}})}:{invoke:(camera,world)=>{assert.equal(world.x,0);assert.equal(world.y,-112);return v({x:1000,y:450});}}}),
 call:(obj,name,...args)=>{
  if(name==='get_gameObject')return 'splash-go';if(name==='get_activeInHierarchy')return true;
  if(name==='get_rectTransform')return 'logo-rect';if(name==='get_rect')return v({m_XMin:-300,m_YMin:-100,m_Width:600});
  if(name==='TransformPoint')return args[0];if(name==='get_canvas')return 'canvas';if(name==='get_worldCamera')return null;
 }};
vm.createContext(c);vm.runInContext(transformSync(require('./source.cjs')('update-notices'),{loader:'ts'}).code,c);
let point=c.locateSplashVersion();assert.equal(point.x,.5);assert.equal(point.y,.45);c.locateSplashVersion();assert.equal(finds,1,'keep logo position after SplashWin disappears');
console.log('PASS: version placement follows native logo bottom and retains its position throughout loading');
