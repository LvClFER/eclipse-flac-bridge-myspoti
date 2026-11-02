const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const source = readFileSync(join(__dirname, '../main.js'), 'utf8');

function setup(verified = true) {
  const settings = {}, state = new Map(), events = {}, hooks = {}, calls = [], logs = [], notices = [];
  vm.runInNewContext(source, { myspoti: {
    features: ['results'],
    storage: { get: k => state.get(k), set: (k, v) => state.set(k, v), remove: k => state.delete(k) },
    settings: { get: k => settings[k] },
    on: (k, fn) => { events[k] = fn; }, provide: (k, fn) => { hooks[k] = fn; },
    log: s => logs.push(s), notify: s => notices.push(s), query: x => new URLSearchParams(x).toString(),
    http: { get(url, options) {
      calls.push({ url, options });
      assert.equal(new URL(url).origin, 'https://api.eclipsemusic.app');
      if (url.endsWith('/verify')) return { ok: verified, status: verified ? 200 : 401,
        json: () => ({ success: true, token: 'rotated.session.secret', user: { id: 'fixture-user' } }) };
      if (url.includes('/config/addon-token')) {
        assert.equal(options.headers.Authorization, 'Bearer rotated.session.secret');
        return { ok: true, status: 200, json: () => ({ musicUrl: 'https://api.eclipsemusic.app/addon/auto-fixture/music/manifest.json' }) };
      }
      return { ok: true, status: 200, json: () => ({ item: null }) };
    } },
  } });
  return { settings, state, events, hooks, calls, logs, notices };
}

test('manual token is validated, rotated and kept for subsequent requests', () => {
  const x = setup();
  x.settings.account_token = 'manual.session.secret';
  x.hooks['audio-source']({ title: 'Song', artist: 'Artist' });
  assert.equal(x.state.get('session_token'), 'rotated.session.secret');
  assert.equal(x.calls[0].options.headers.Authorization, 'Bearer manual.session.secret');
  assert.equal(x.calls.length, 3);
  assert.doesNotMatch(x.logs.join(' '), /manual.session.secret|rotated.session.secret|auto-fixture/);
  x.hooks['audio-source']({ title: 'Song', artist: 'Artist' });
  assert.equal(x.calls.length, 4, 'recent session must not refresh again');
});

test('editing or clearing the manual token invalidates the cached session', () => {
  const x = setup();
  x.state.set('session_token', 'old.session.secret');
  x.state.set('session_checked', Date.now());
  x.settings.account_token = 'replacement.session.secret';
  x.events.setting({ key: 'account_token' });
  assert.equal(x.state.has('session_token'), false);
  x.hooks['audio-source']({ title: 'Song', artist: 'Artist' });
  assert.equal(x.calls[0].options.headers.Authorization, 'Bearer replacement.session.secret');
  x.settings.account_token = '';
  x.events.setting({ key: 'account_token' });
  assert.equal(x.state.has('session_token'), false);
});

test('an explicit addon URL takes precedence over the discovered URL', () => {
  const x = setup();
  x.settings.addon_url = 'https://api.eclipsemusic.app/addon/manual-fixture/music/manifest.json';
  x.state.set('session_addon_url', 'https://api.eclipsemusic.app/addon/old-fixture/music/manifest.json');
  x.hooks['audio-source']({ title: 'Song', artist: 'Artist' });
  assert.match(x.calls[0].url, /manual-fixture/);
});

test('old sessions refresh before requesting audio and use the rotated token', () => {
  const x = setup();
  x.state.set('session_token', 'old.session.secret');
  x.state.set('session_checked', Date.now() - 2 * 86400000);
  x.hooks['audio-source']({ title: 'Song', artist: 'Artist' });
  assert.equal(x.calls.length, 3);
  assert.equal(x.calls[2].options.headers.Authorization, 'Bearer rotated.session.secret');
});

test('expired sessions return sign-in without making media requests', () => {
  const x = setup(false);
  x.state.set('session_token', 'expired.session.secret');
  assert.equal(x.hooks['audio-source']({ title: 'Song', artist: 'Artist' }).outcome, 'sign-in');
  assert.equal(x.calls.length, 1);
});
