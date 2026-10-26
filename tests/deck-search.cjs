const vm=require('vm'),assert=require('assert/strict'),{transformSync}=require('esbuild');
const c={section:()=>{}};vm.createContext(c);vm.runInContext(transformSync(require('./source.cjs')('deck-search'),{loader:'ts'}).code,c);
assert(c.deckSearchMatches('Моя Колода','коло'));assert(c.deckSearchMatches('Invade Mage','MAGE'));assert(c.deckSearchMatches('<b>Dragon</b> Archer','dragon'));assert(c.deckSearchMatches('Anything',''));
assert(!c.deckSearchMatches('Archer','mage'));assert(c.deckSearchMatches('Ｆｏｏ','foo'));assert(c.deckSearchMatches('Deck','  deck  '));
console.log('PASS: deck names filter by case-insensitive Unicode substring, strip rich text and reset on empty query');
