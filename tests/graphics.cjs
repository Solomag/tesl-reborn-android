const vm=require('vm'),assert=require('assert/strict'),{transformSync}=require('esbuild');
const c={section:()=>{}};vm.createContext(c);vm.runInContext(transformSync(require('./source.cjs')('graphics'),{loader:'ts'}).code,c);
assert.equal(c.graphicsFrameRate('{"frameRate":30}'),30);assert.equal(c.graphicsFrameRate('{"frameRate":120}'),120);
assert.equal(c.graphicsFrameRate('{"frameRate":45}'),45);assert.equal(c.graphicsFrameRate('{"frameRate":500}'),null);assert.equal(c.graphicsFrameRate('{"frameRate":44.5}'),null);assert.equal(c.graphicsFrameRate('{}'),null);
assert.equal(c.graphicsFrameRate(null),null);assert.equal(c.graphicsFrameRate('not json'),null);
console.log('PASS: the Game Data frame rate is read for whole rates from 20 to 240; missing or broken files keep the game default');

// The FPS meter samples once a second from the frames counted in between.
{
 const u={section:()=>{}};vm.createContext(u);vm.runInContext(transformSync(require('./source.cjs')('update-notices'),{loader:'ts'}).code,u);
 const counter={frames:0,since:1000,value:0};
 counter.frames=30;assert.equal(u.fpsSample(counter,1500),0,'under a second keeps the last value');
 counter.frames=60;assert.equal(u.fpsSample(counter,2000),60);assert.equal(counter.frames,0);
 counter.frames=110;assert.equal(u.fpsSample(counter,3000),110);
 console.log('PASS: the FPS meter shows frames per second, refreshed each second');
}

assert.equal(c.graphicsQuality('{"quality":0}'),0);assert.equal(c.graphicsQuality('{"quality":3}'),3);
assert.equal(c.graphicsQuality('{"quality":4}'),null);assert.equal(c.graphicsQuality('{"frameRate":30}'),null);assert.equal(c.graphicsQuality('x'),null);
console.log('PASS: a saved quality of VeryLow..High replaces the device pick; Auto keeps it');

assert.equal(c.graphicsRenderScale('{"renderScale":75}'),75);assert.equal(c.graphicsRenderScale('{"renderScale":100}'),null);assert.equal(c.graphicsRenderScale('{"renderScale":65}'),65);assert.equal(c.graphicsRenderScale('{"renderScale":10}'),null);assert.equal(c.graphicsRenderScale('{}'),null);
{
 const state={width:0,height:0};
 assert.deepEqual({...c.scaledResolution(state,2841,1344,75)},{width:2131,height:1008},'the screen size is scaled');
 assert.deepEqual({...c.scaledResolution(state,2131,1008,75)},{width:2131,height:1008},'the scaled size is not scaled again');
 assert.deepEqual({...c.scaledResolution(state,2841,1344,50)},{width:1421,height:672});
 console.log('PASS: the render resolution scales the screen size once and never compounds');
}
