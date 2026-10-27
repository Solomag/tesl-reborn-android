const vm=require('vm'),assert=require('assert/strict'),{transformSync}=require('esbuild');
// The match intro tint: Execute only remembers the match, the tint is a
// scheduled task after MatchIntroWin.Show, and dead panels are skipped.
const hooks={},queue=[],logs=[];let frees=0;
const value=(fields={},extra={})=>Object.assign({handle:{isNull:()=>false},field:name=>({value:fields[name]}),ref(){return {target:this,free:()=>frees++};}},extra);
const list=items=>({items,method:(name)=>({invoke:arg=>name==='IndexOf'?items.indexOf(arg):items[arg]})});
const banner=(id)=>({id,color:null,sprite:null,dead:false});
const myBanner=banner('mine'),urBanner=banner('theirs');
const win=value({MyInfoPanel:value({TitleBanner:myBanner}),UrInfoPanel:value({TitleBanner:urBanner})});
const player=(id,title)=>({id,title});
const data=value({ActionData:{players:list([player(0,'title_reborn_keeper'),player(1,'title_common')])}});
const board=value({MatchUI:value({MatchIntroWin:win})});
const titles=list([value({ResourceId:value({UniqueName:{content:'title_reborn_keeper'}}),Rarity:3}),value({ResourceId:value({UniqueName:{content:'title_common'}}),Rarity:0})]);
const c={section:(_,fn)=>fn(),img:{},NULL:null,RARITY_LEGENDARY:3,isNull:x=>x==null,enumVal:x=>x,enumBox:(_,n)=>n,rgba:(r,g,b,a)=>({r,g,b,a}),
 schedule:(_,fn)=>queue.push(fn),log:m=>logs.push(m),
 ucls:()=>({method:()=>({invoke:obj=>Boolean(obj&&obj.dead)})}),
 Il2Cpp:{Object:function(ptr){return ptr;},string:x=>x},
 Interceptor:{attach:(addr,hook)=>hooks[addr]=hook},
 cls:(_,name)=>({
  'SPTESL.SequenceMatchIntro':{methods:[{name:'Execute',parameterCount:2,isStatic:false,virtualAddress:'Execute',parameters:[{type:{name:'MatchLogAnimationData'}},{type:{name:'BoardState'}}]}]},
  MatchIntroWin:{tryMethod:()=>({virtualAddress:Object.assign('Show',{isNull:()=>false})})},
  'SPTESL.GameManager':{method:()=>({invoke:()=>value({Config:value({Titles:titles})})})},
  'SPTESL.GameNetworkManager':{method:()=>({invoke:()=>({method:()=>({invoke:id=>id})})})},
  UIResourceManager:{method:()=>({invoke:()=>({method:()=>({invoke:()=>'legendary-sprite'})})})},
 })[name]||{},
 call:(obj,name,...args)=>{
  if(name==='get_MatchIntroPlayers')return obj.players;
  if(name==='get_Count')return obj.items.length;
  if(name==='get_InventoryTypes')return list(['title']);
  if(name==='get_InventoryValues')return list([{content:obj.title}]);
  if(name==='get_PlayerInstanceId')return obj.id;
  if(obj.dead)throw Error(`${name} on a destroyed object`);
  if(name==='set_color'){obj.color=args[0];return;}
  if(name==='set_overrideSprite'){obj.sprite=args[0];return;}
  throw Error(name);
 }};
vm.createContext(c);vm.runInContext(transformSync(require('./source.cjs')('title-intro'),{loader:'ts'}).code,c);
hooks.Execute.onEnter([{}, data, board]);
assert.equal(queue.length,0,'returning from the coroutine factory does nothing');
assert.equal(myBanner.color,null,'nothing is tinted before the intro window is shown');
hooks.Show.onLeave();assert.equal(myBanner.color,null,'the tint is deferred to the scheduler');
for(const task of queue.splice(0))task();
assert.deepEqual(myBanner.color,{r:1,g:0.75,b:0,a:1});assert.equal(myBanner.sprite,'legendary-sprite');
assert.equal(urBanner.color,null,'a common title is left alone');
assert.ok(logs.includes('titles UI: match intro legendary banner tinted (1)'));
assert.equal(frees,2,'the remembered match is released');
hooks.Show.onLeave();assert.equal(queue.length,0,'a second Show without a new match does nothing');
console.log('PASS: the match intro tint waits for MatchIntroWin.Show and runs as a scheduled task');

hooks.Execute.onEnter([{}, data, board]);myBanner.dead=true;myBanner.color=null;
hooks.Show.onLeave();for(const task of queue.splice(0))task();
assert.equal(myBanner.color,null);assert.ok(!logs.some(m=>m.includes('failed')),'a destroyed banner is skipped, not called');
console.log('PASS: a destroyed intro banner is skipped');
