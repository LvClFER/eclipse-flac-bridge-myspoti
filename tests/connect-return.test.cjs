const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const uri = 'spotify:track:4uLU6hMCjMI75M1A2tKUQC';
function setup() {
  const events = {}, calls = [], logs = [];
  const state = { devices: [{ active: true, local: true }], player: { item: { uri }, isPaused: false, isBuffering: false }, enabled: true };
  vm.runInNewContext(readFileSync(join(__dirname, '../main.js'), 'utf8'), { myspoti: {
    on: (name, fn) => { events[name] = fn; }, provide() {}, log: s => logs.push(s),
    settings: { get: key => key === 'connect_return' ? state.enabled : undefined },
    spotify: { devices: { list: () => state.devices }, player: { state: () => state.player } },
    player: { current: () => ({ uri }), play: () => { calls.push('play'); return true; } },
  } });
  const send = (type = 'start') => events.playback({ source: 'spotify', type, track: { uri } });
  const away = () => { state.devices = [{ active: true, local: false }]; send(); };
  return { state, events, calls, logs, send, away };
}
test('outgoing transfer echoes do not pull playback back from the PC', () => {
  const h = setup(); h.send(); h.send('resume');
  h.away(); h.send('progress');
  assert.deepEqual(h.calls, []);
});
test('confirmed return resumes MySpoti once and preserves native queue/position handling', () => {
  const h = setup(); h.away(); h.state.devices = [{ active: true, local: true }];
  h.send('resume'); h.send('progress');
  assert.deepEqual(h.calls, ['play']);
  h.events.playback({ source: 'local', origin: 'audio-source', providerId: 'dev.personal.eclipseflacbridge', type: 'start' });
  h.send('resume'); assert.deepEqual(h.calls, ['play']);
});
test('return guard resets for the next round trip', () => {
  const h = setup();
  for (let i = 0; i < 2; i++) {
    h.away(); h.state.devices = [{ active: true, local: true }]; h.send('resume');
    h.events.playback({ source: 'local', origin: 'audio-source', providerId: 'dev.personal.eclipseflacbridge', type: 'start' });
  }
  assert.equal(h.calls.length, 2);
});
test('does not take over paused, buffering, ambiguous or unknown playback', () => {
  for (const change of [
    h => { h.state.player.isPaused = true; },
    h => { h.state.player.isBuffering = true; },
    h => { h.state.devices = []; },
    h => { h.state.devices.push({ active: true, local: false }); },
    h => { h.state.player.item.uri = 'spotify:track:other'; },
  ]) {
    const h = setup(); h.away(); h.state.devices = [{ active: true, local: true }]; change(h); h.send();
    assert.deepEqual(h.calls, []);
  }
});
test('disabled mode and failed device reads leave playback untouched', () => {
  const h = setup(); h.away(); h.state.devices = null; h.send();
  h.state.devices = [{ active: true, local: true }]; h.state.enabled = false; h.send();
  assert.deepEqual(h.calls, []);
});
