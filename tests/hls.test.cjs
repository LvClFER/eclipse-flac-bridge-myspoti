const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const source = readFileSync(join(__dirname, '../main.js'), 'utf8');
const playlist = '#EXTM3U\n#EXT-X-MAP:URI="https://cdn.example.com/0.mp4?a=1&b=2"\n#EXTINF:3.994,\nhttps://cdn.example.com/1.mp4?a=1&b=2\n#EXTINF:1.006,\nhttps://cdn.example.com/2.mp4?a=1&b=2\n#EXT-X-ENDLIST\n';

function run(body, features = ['results', 'audio.manifest'], encrypted = false) {
  const hooks = {};
  vm.runInNewContext(source, { myspoti: {
    features, storage: { get: key => key === 'session_checked' ? Date.now() : undefined },
    settings: { get: key => key === 'addon_url' ? 'https://api.eclipsemusic.app/addon/fixture/music/manifest.json' : '' },
    provide: (name, fn) => { hooks[name] = fn; }, on() {}, log() {},
    query: data => new URLSearchParams(data).toString(),
    util: { base64Encode: s => Buffer.from(s).toString('base64') },
    http: { get(url) {
      const payload = url.includes('/resolve?') ? { item: { id: '1', title: 'Song', artist: 'Artist' } }
        : { url: 'https://api.eclipsemusic.app/api/tidal/hls/fixture.m3u8', codec: 'flac', format: 'hls', container: 'fmp4', encrypted };
      return { ok: true, status: 200, body, json: () => payload };
    } },
  } });
  const track = { title: 'Song', artist: 'Artist' };
  return { audio: hooks['audio-source'](track), download: hooks['download-source'](track) };
}

test('clear numbered HLS becomes DASH for playback and a FLAC download', () => {
  const { audio, download } = run(playlist);
  const mpd = Buffer.from(audio.manifest, 'base64').toString();
  assert.equal(audio.codec, 'flac');
  assert.equal(audio.durationMs, 5000);
  assert.match(mpd, /startNumber="1"/);
  assert.match(mpd, /\$Number\$\.mp4\?a=1&amp;b=2/);
  assert.match(mpd, /<S d="3994"\/><S d="1006"\/>/);
  assert.equal(download[0].format, 'dash-flac');
  assert.equal(download[0].manifest, audio.manifest);
});

for (const [name, body] of [
  ['live', playlist.replace('#EXT-X-ENDLIST', '')],
  ['encrypted', playlist.replace('#EXTM3U', '#EXTM3U\n#EXT-X-KEY:METHOD=AES-128')],
  ['discontinuous', playlist.replace('#EXTINF:1.006', '#EXT-X-DISCONTINUITY\n#EXTINF:1.006')],
  ['missing segment', playlist.replace('/2.mp4?', '/3.mp4?')],
  ['changed token', playlist.replace('/2.mp4?a=1', '/2.mp4?a=3')],
  ['unsafe URL', playlist.replaceAll('https://cdn.example.com', 'http://cdn.example.com')],
  ['missing init', playlist.replace(/^#EXT-X-MAP:.*\n/m, '')],
  ['missing duration', playlist.replace('#EXTINF:1.006,\n', '')],
]) test(`rejects ${name} playlists`, () => {
  const { audio, download } = run(body);
  assert.equal(audio.outcome, 'quality-unavailable');
  assert.equal(download.outcome, 'quality-unavailable');
});

test('requires manifest support and never converts DRM', () => {
  assert.equal(run(playlist, ['results']).audio.outcome, 'quality-unavailable');
  assert.equal(run(playlist, undefined, true).audio.outcome, 'quality-unavailable');
});
