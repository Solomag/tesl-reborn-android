// The chat input with a fake TMP_InputField: keyboard emoji typed on the
// phone turn into :name: codes with the caret kept in place, panel taps
// insert codes at the caret, and DEL removes a whole code at once.
const assert = require('node:assert');
const emojis = require('./source.cjs')('chat-emojis');
const window = require('./source.cjs')('chat-window');
const table = emojis.slice(emojis.indexOf('const EMOJI_UNICODE'), emojis.indexOf('function emojiIndex'));
const input = window.slice(window.indexOf('let chatEmojiReports'), window.indexOf('// A messenger-style panel'));
const logs = [];
const api = new Function('call', 'Il2Cpp', 'log', 'emojiByName', `${table};${input};
  return { chatReplaceKeyboardEmoji, chatInputInsert, chatInputErase };`)(
  (target, name, value) => target[name](value),
  { string: value => value },
  line => logs.push(line),
  new Map([['slight_smile', {}], ['heart', {}], ['heart_on_fire', {}]]));

function field(text, caret = text.length) {
  const state = { text, caret, sets: 0 };
  const methods = { set_stringPosition: value => { state.caret = value; } };
  state.target = {
    get_text: () => ({ content: state.text }),
    set_text: value => { state.text = value; state.sets++; },
    tryMethod: (name, count) => methods[name] && count === 1 ? { invoke: methods[name] } : null,
  };
  state.record = { input: { target: state.target }, caret, lastText: null };
  return state;
}

// Typed at the end: the emoji becomes its code, the caret follows.
let f = field('hi \u{1f642}');
api.chatReplaceKeyboardEmoji(f.record);
assert.equal(f.text, 'hi :slight_smile:');
assert.equal(f.caret, f.text.length);
assert.equal(logs.length, 1, 'the replacement is logged');

// Typed in the middle: the caret stays right after the new code.
f = field('a \u{2764}\u{fe0f} b', 4);
api.chatReplaceKeyboardEmoji(f.record);
assert.equal(f.text, 'a :heart: b');
assert.equal(f.caret, 'a :heart:'.length);

// Skin tone dropped; unchanged text is not written back every frame.
f = field('\u{1f44d}\u{1f3fd}');
api.chatReplaceKeyboardEmoji(f.record);
assert.equal(f.text, ':thumbs_up:');
api.chatReplaceKeyboardEmoji(f.record);
f.record.lastText = null;
api.chatReplaceKeyboardEmoji(f.record);
assert.equal(f.sets, 1, 'set_text only when something changed');

// Plain text and emoji without a sprite are left alone.
f = field('ok :) \u{1f468}\u{200d}\u{1f4bb}');
api.chatReplaceKeyboardEmoji(f.record);
assert.equal(f.sets, 0);

// Panel taps insert at the caret, DEL takes a whole code, then single chars.
f = field('go', 0);
api.chatInputInsert(f.record, 'heart_on_fire');
assert.equal(f.text, ':heart_on_fire: go');
assert.equal(f.caret, ':heart_on_fire: '.length);
api.chatInputInsert(f.record, 'heart');
assert.equal(f.text, ':heart_on_fire: :heart: go');
api.chatInputErase(f.record);
assert.equal(f.text, ':heart_on_fire: go');
assert.equal(f.caret, ':heart_on_fire: '.length);
f.record.caret = f.text.length;
api.chatInputErase(f.record);
assert.equal(f.text, ':heart_on_fire: g', 'ordinary text loses one character');
f = field(':nope:');
api.chatInputErase(f.record);
assert.equal(f.text, ':nope', 'unknown codes are not removed whole');
f = field('x', 0);
api.chatInputErase(f.record);
assert.equal(f.sets, 0, 'nothing before the caret: nothing erased');

console.log('PASS: chat input rewrites keyboard emoji in place, panel inserts and erases whole emoji codes');
