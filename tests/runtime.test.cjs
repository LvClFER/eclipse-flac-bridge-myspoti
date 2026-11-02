const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

const script = readFileSync(join(__dirname, '../main.js'), 'utf8');

test('ISRC retry and stream fit the audio budget and never log the private URL', () => {
  const hooks = {};
  const calls = [];
  const logs = [];
  const track = { title: 'Test Song', artist: 'Test Artist', isrc: 'TEST00000001' };
  vm.runInNewContext(script, {
    myspoti: {
      features: ['results'], storage: { get: key => key === 'session_checked' ? Date.now() : undefined },
      settings: { get: key => ({ addon_url: 'https://api.eclipsemusic.app/addon/private-fixture/music/manifest.json', account_token: 'private-account-token', quality: 'FLAC' })[key] },
      log: message => logs.push(message),
      query: value => new URLSearchParams(value).toString(),
      provide: (name, fn) => { hooks[name] = fn; },
      on() {},
      http: { get(url, options) {
        calls.push({ url, options });
        const body = calls.length === 1 ? { item: null }
          : calls.length === 2 ? { item: { id: 'test', title: track.title, artist: track.artist } }
            : { url: 'https://media.example.com/private-stream.flac', codec: 'flac' };
        return { ok: true, status: 200, headers: {}, json: () => body };
      } },
    },
  });
  assert.equal(hooks['audio-source'](track).codec, 'flac');
  assert.equal(calls.length, 3);
  assert.match(calls[0].url, /isrc=/);
  assert.doesNotMatch(calls[1].url, /isrc=/);
  assert.ok(calls.reduce((sum, call) => sum + call.options.timeout, 0) < 15000);
  for (const call of calls) {
    assert.equal(new URL(call.url).origin, 'https://api.eclipsemusic.app');
    assert.equal(call.options.headers.Authorization, 'Bearer private-account-token');
  }
  assert.doesNotMatch(logs.join('\n'), /private-fixture|private-stream|private-account-token/);
});

test('rejects an untrusted addon host before sending account credentials', () => {
  const hooks = {};
  vm.runInNewContext(script, {
    myspoti: {
      features: ['results'], storage: { get: key => key === 'session_checked' ? Date.now() : undefined },
      settings: { get: key => key === 'addon_url'
        ? 'https://api.eclipsemusic.app.evil.example/addon/private/music/manifest.json'
        : 'private-account-token' },
      log() {},
      provide: (name, fn) => { hooks[name] = fn; },
      on() {},
      http: { get() { assert.fail('credentials must never reach an untrusted host'); } },
    },
  });
  assert.equal(hooks['audio-source']({ title: 'Song', artist: 'Artist' }).outcome, 'sign-in');
});
