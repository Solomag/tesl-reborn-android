const vm=require('vm'),assert=require('assert/strict'),{transformSync}=require('esbuild');
const c={section:()=>{}};vm.createContext(c);vm.runInContext(transformSync(require('./source.cjs')('deck-search'),{loader:'ts'}).code,c);
assert(c.deckSearchMatches('Моя Колода','коло'));assert(c.deckSearchMatches('Invade Mage','MAGE'));assert(c.deckSearchMatches('<b>Dragon</b> Archer','dragon'));assert(c.deckSearchMatches('Anything',''));
assert(!c.deckSearchMatches('Archer','mage'));assert(c.deckSearchMatches('Ｆｏｏ','foo'));assert(c.deckSearchMatches('Deck','  deck  '));
console.log('PASS: deck names filter by case-insensitive Unicode substring, strip rich text and reset on empty query');

const setters=[];
c.uiAdd=(go,type)=>({type,method:()=>({parameters:[{type:{class:{}}}]})});
c.ucls=()=>({type:{object:{}},method:()=>({overload:()=>({invoke:()=>({font:true})})})});
c.isNull=x=>x==null;c.Il2Cpp={string:x=>x};c.uiEnum=()=> 'MiddleLeft';c.enumBox=(_,v)=>v;c.rgba=(...values)=>values;
c.call=(obj,name,value)=>{setters.push([obj,name,value]);if(name==='set_textComponent')assert.equal(value.type,'UnityEngine.UI.Text');};
const label=c.deckSearchText({},'Тест ввода',32);assert.equal(label.type,'UnityEngine.UI.Text');
const input=c.deckSearchInput({},label,{});assert.equal(input.type,'UnityEngine.UI.InputField');
assert(setters.some(([o,k,v])=>k==='set_text'&&v==='Тест ввода'));
assert(setters.some(([o,k,v])=>k==='set_alignment'&&v==='MiddleLeft'));
assert(setters.some(([o,k,v])=>k==='set_supportRichText'&&v===false));
assert(setters.some(([o,k,v])=>k==='set_lineType'&&v===0));
console.log('PASS: actual search text/input constructors use the same legacy Unity family, visible font/color, centred single-line text and literal query text');
