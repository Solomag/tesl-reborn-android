// Phone keyboard emoji become the PC :name: codes, so PC players see the sprite.
const assert = require('node:assert');
const source = require('./source.cjs')('chat-emojis');
const from = source.indexOf('const EMOJI_UNICODE'), to = source.indexOf('function emojiIndex');
const emojiFromUnicode = new Function(`${source.slice(from, to)};return emojiFromUnicode;`)();
assert.equal(emojiFromUnicode('hi \u{1f642}'), 'hi :slight_smile:');
assert.equal(emojiFromUnicode('\u{1f44d}\u{1f3fd} ok'), ':thumbs_up: ok', 'skin tones fall back to the base sprite');
assert.equal(emojiFromUnicode('\u{2764}\u{fe0f} \u{1f499}'), ':heart: :heart:', 'coloured hearts use the heart');
assert.equal(emojiFromUnicode('\u{1f636}\u{200d}\u{1f32b}\u{fe0f}'), ':face_in_clouds:', 'the longest sequence wins');
assert.equal(emojiFromUnicode('plain :) text'), 'plain :) text');
assert.equal(emojiFromUnicode('\u{1f468}\u{200d}\u{1f4bb}'), '\u{1f468}\u{200d}\u{1f4bb}', 'no sprite: left as typed');
const fs = require('node:fs');
// The PC atlas is not in git; check names against it when it is here.
if (fs.existsSync('resources/emojis/people.json')) {
const names = new Set(JSON.parse(fs.readFileSync('resources/emojis/people.json', 'utf8').replace(/^﻿/, ''))
  .Groups.flatMap(group => group.Sprites.map(sprite => sprite.Name)));
const table = new Function(`${source.slice(from, source.indexOf('let emojiUnicode'))};return EMOJI_UNICODE;`)();
for (const [, name] of table) assert(names.has(name), `${name} is a PC sprite`);
assert.equal(new Set(table.map(([, name]) => name)).size, names.size, 'every PC sprite has its Unicode emoji');
}
console.log('PASS: keyboard emoji map to PC sprites, skin tones and variation selectors dropped, longest sequence first');
