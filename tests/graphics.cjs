const vm=require('vm'),assert=require('assert/strict'),{transformSync}=require('esbuild');
const c={section:()=>{}};vm.createContext(c);vm.runInContext(transformSync(require('./source.cjs')('graphics'),{loader:'ts'}).code,c);
assert.equal(c.graphicsFrameRate('{"frameRate":30}'),30);assert.equal(c.graphicsFrameRate('{"frameRate":120}'),120);
assert.equal(c.graphicsFrameRate('{"frameRate":45}'),null);assert.equal(c.graphicsFrameRate('{}'),null);
assert.equal(c.graphicsFrameRate(null),null);assert.equal(c.graphicsFrameRate('not json'),null);
console.log('PASS: the Game Data frame rate is read only for 30/60/90/120; missing or broken files keep the game default');

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
