const vm=require('vm'),assert=require('assert/strict'),{transformSync}=require('esbuild');
const c={section:()=>{}};vm.createContext(c);vm.runInContext(transformSync(require('./source.cjs')('graphics'),{loader:'ts'}).code,c);
assert.equal(c.graphicsFrameRate('{"frameRate":30}'),30);assert.equal(c.graphicsFrameRate('{"frameRate":120}'),120);
assert.equal(c.graphicsFrameRate('{"frameRate":45}'),null);assert.equal(c.graphicsFrameRate('{}'),null);
assert.equal(c.graphicsFrameRate(null),null);assert.equal(c.graphicsFrameRate('not json'),null);
console.log('PASS: the Game Data frame rate is read only for 30/60/90/120; missing or broken files keep the game default');
