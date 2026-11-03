/* Eclipse FLAC Bridge 0.5.1 for MySpoti. No external dependencies.
 * All diagnostic logs redact the account-specific path and media URLs.
 */
(function () {
  'use strict';
  var P = '[Eclipse Bridge 0.5.1] ';
  function s(x) { return x == null ? '' : String(x).trim(); }
  function log(x) { try { myspoti.log(P + x); } catch (e) {} }
  function feature(x) { return !!(myspoti.features && myspoti.features.indexOf(x) >= 0); }
  function reason(type, detail) {
    if (!feature('results')) return null;
    var r = {outcome: type};
    if (detail) r.detail = detail.slice(0,120);
    if (type === 'rate-limited') r.retryAfterMs = 60000;
    return r;
  }
  function baseFrom(v) {
    v=s(v);
    var m = /^https:\/\/api\.eclipsemusic\.app(\/addon\/[a-zA-Z0-9_-]+\/music)\/?(?:manifest\.json)?\/?(?:\?.*)?$/.exec(v);
    return m ? 'https://api.eclipsemusic.app' + m[1] : '';
  }
  function baseUrl() { return baseFrom(myspoti.settings.get('addon_url') || myspoti.storage.get('session_addon_url')); }
  function accountToken() { return s(myspoti.storage.get('session_token') || myspoti.settings.get('account_token')); }
  var deadline=0;
  function timeout(max) { return deadline ? Math.max(1000,Math.min(max,deadline-Date.now())) : max; }
  function syncSession(token) {
    try {
      var options={headers:{Authorization:'Bearer '+token},timeout:timeout(3000)};
      var verified=myspoti.http.get('https://api.eclipsemusic.app/api/auth/mobile/verify',options);
      if (verified.status===401 || verified.status===403) return {error:'sign-in'};
      if (!verified.ok) return {error:'server-down'};
      var data=verified.json();
      if (!data.success || !data.user || !s(data.user.id) || !s(data.token)) return {error:'sign-in'};
      var config=myspoti.http.get('https://api.eclipsemusic.app/api/addons/'+encodeURIComponent(data.user.id)+'/config/addon-token',
        {headers:{Authorization:'Bearer '+data.token},timeout:timeout(3000)});
      if (config.status===401 || config.status===403) return {error:'sign-in'};
      if (!config.ok) return {error:'server-down'};
      var url=config.json().musicUrl;
      if (!baseFrom(url)) return {error:'sign-in'};
      myspoti.storage.set('session_token',data.token);
      myspoti.storage.set('session_addon_url',url);
      myspoti.storage.set('session_checked',Date.now());
      log('session: authenticated; addon URL configured automatically');
      return {};
    } catch (e) { log('session: verification unavailable'); return {error:'network'}; }
  }
  function quality() { return s(myspoti.settings.get('quality')) === 'Hi-Res FLAC' ? 'HI_RES_LOSSLESS' : 'LOSSLESS'; }
  function q(params) { return myspoti.query(params); }
  // The error response sometimes provides the reason for a 403. Classify it
  // without ever logging user-specific addon URLs, keys, email, or raw server text.
  function deniedReason(r) {
    var body = s(r && r.body).toLowerCase().slice(0,5000);
    var h = (r && r.headers) || {};
    var type = s(h['content-type']).toLowerCase();
    var ct = type.indexOf('json') >= 0 ? 'json' : type.indexOf('html') >= 0 ? 'html' : 'other/unknown';
    var category = 'unspecified reason';
    if (/expired|expirad/.test(body) && /token|key|link|subscription|assinatura|subscri/.test(body)) category='expired key/subscription';
    else if (/subscription|supporter|subscri|membership|premium|payment|billing/.test(body)) category='subscription/account permissions';
    else if (/invalid.{0,16}(token|key|api key)|invalid.{0,16}addon/.test(body)) category='invalid addon key';
    else if (/unauthori[sz]ed|authentication|authentication required|access token|login required|log in|not authenticated|missing token|bearer/.test(body)) category='additional authentication required';
    else if (/only.{0,30}(eclipse|app|client)|unsupported client|not allowed.{0,30}client|client.{0,30}forbidden/.test(body)) category='external client not authorized';
    else if (/cloudflare|attention required|access denied|bot|security check|waf/.test(body)) category='server protection/access restriction';
    else if (/forbidden|access denied|not allowed|denied|permission/.test(body)) category='permission denied';
    log('HTTP ' + r.status + ': format=' + ct + ', classification=' + category + ', WWW-Authenticate=' + (h['www-authenticate'] ? 'yes' : 'no'));
  }
  function jsonGet(url, stage) {
    try {
      var headers = {}, token = accountToken();
      // Account credentials belong only to the validated Eclipse API origin.
      if (token && /^https:\/\/api\.eclipsemusic\.app\/addon\//.test(url)) headers.Authorization = 'Bearer ' + token;
      var r = myspoti.http.get(url, {timeout:timeout(4000),headers:headers});
      log(stage + ': HTTP ' + r.status);
      if (r.status === 401) { deniedReason(r); return {error:'sign-in',status:401}; }
      if (r.status === 403) { deniedReason(r); return {error:'forbidden',status:403}; }
      if (r.status === 429) {
        var retry = Number(r.headers['retry-after'] || r.headers['Retry-After']);
        return {error:'rate-limited',retryAfterMs:isFinite(retry) && retry > 0 ? retry * 1000 : 60000};
      }
      if (!r.ok) return {error:'http-' + r.status};
      try {
        var data = r.json();
        if (data && typeof data === 'object') log(stage + ': fields [' + Object.keys(data).slice(0,12).join(',') + ']');
        return {data:data};
      } catch (e) {
        log(stage + ': response is not valid JSON');
        return {error:'invalid-json'};
      }
    } catch (e) {
      // Do not expose exception text: the request URL contains a private subscriber key.
      log(stage + ': network error/timeout');
      return {error:'network'};
    }
  }
  function norm(v) {
    return s(v).toLowerCase().replace(/&/g,' and ')
      .replace(/[áàâãä]/g,'a').replace(/[éèêë]/g,'e').replace(/[íìîï]/g,'i')
      .replace(/[óòôõö]/g,'o').replace(/[úùûü]/g,'u').replace(/ç/g,'c')
      .replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim();
  }
  function artistName(a) {
    if (typeof a === 'string') return a;
    if (a && typeof a === 'object') return s(a.name || a.title);
    return '';
  }
  function matching(t, item) {
    if (!item || typeof item !== 'object') return {ok:false, why:'invalid item'};
    var a = s(t.isrc).toUpperCase(), b = s(item.isrc).toUpperCase();
    if (a && b) return {ok:a===b, why:a===b?'ISRC confirmed':'ISRC mismatch', isrc:a===b};
    var title = norm(t.title), got = norm(item.title || item.name);
    // Avoid treating an empty metadata response as a verified match.
    if (!got || !title || got !== title) return {ok:false, why:'title mismatch'};
    var src = norm(t.artist), dst = norm(artistName(item.artist) || (item.artists && artistName(item.artists[0])));
    if (!src || !dst || src !== dst) return {ok:false, why:'artist mismatch'};
    var d1 = Number(t.durationMs), d2 = Number(item.durationMs || (Number(item.duration) > 0 ? Number(item.duration) * 1000 : 0));
    if (d1 > 0 && d2 > 0 && Math.abs(d1-d2) > 15000) return {ok:false, why:'duration mismatch'};
    return {ok:true, why:'matching metadata', isrc:false};
  }
  function resolve(t, base, includeIsrc) {
    var p = {title:s(t.title), artist:s(t.artist)};
    if (includeIsrc && s(t.isrc)) p.isrc = s(t.isrc);
    if (Number(t.durationMs)>0) p.durationMs = Number(t.durationMs);
    var stage = 'resolve' + (includeIsrc && s(t.isrc) ? '(ISRC)' : '(text)');
    var r = jsonGet(base + '/resolve?' + q(p), stage);
    if (r.error) { r.stage='resolve'; return r; }
    var d = r.data || {};
    if (d.item === null || d.found === false) { log(stage + ': no match'); return {miss:true}; }
    var it = d.item || d.track || (d.result && d.result.item) || d.result || d;
    if (!it || typeof it !== 'object' || !s(it.id || it.trackId || d.trackId)) {
      log(stage + ': no ID; item fields [' + (it && typeof it === 'object' ? Object.keys(it).slice(0,10).join(',') : 'none') + ']');
      return {miss:true};
    }
    var m = matching(t,it);
    log(stage + ': ID ' + (m.ok ? 'found' : 'rejected') + ' (' + m.why + ')');
    if (!m.ok) return {miss:true};
    return {id:s(it.id || it.trackId || d.trackId), isrcMatched:!!m.isrc, item:it};
  }
  function streamObject(payload) {
    var o=payload;
    for (var i=0;i<3;i++) {
      if (!o || typeof o !== 'object') break;
      if (typeof o.url==='string' || typeof o.streamURL==='string' || typeof o.streamUrl==='string') break;
      if (o.data && typeof o.data === 'object') o=o.data;
      else if (o.stream && typeof o.stream === 'object') o=o.stream;
      else if (o.result && typeof o.result === 'object') o=o.result;
      else break;
    }
    return o;
  }
  function xml(v) { return v.replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
  function mediaUrl(v) { return /^https:\/\/[a-z0-9.-]+\/(?:[^\s"<>]*)$/i.test(v); }
  function hlsManifest(text) {
    // shortcut: finite, numbered, clear fMP4 playlists only; extend when Eclipse changes its layout.
    if (text.indexOf('#EXTM3U') !== 0 || text.indexOf('#EXT-X-ENDLIST') < 0 || /#EXT-X-(KEY|BYTERANGE|DISCONTINUITY|STREAM-INF)/.test(text)) return null;
    var lines=text.split(/\r?\n/), init='', template='', start=0, pending=0, durations=[], total=0;
    for (var i=0;i<lines.length;i++) {
      var line=s(lines[i]);
      if (line.indexOf('#EXT-X-MAP:')===0) {
        var map=/^#EXT-X-MAP:URI="([^"]+)"$/.exec(line);
        if (!map || init || !mediaUrl(map[1])) return null;
        init=map[1];
      } else if (line.indexOf('#EXTINF:')===0) {
        if (pending) return null;
        pending=Math.round(Number(line.slice(8).split(',')[0])*1000);
        if (!isFinite(pending) || pending<=0) return null;
      } else if (line && line.charAt(0)!=='#') {
        if (!pending || !mediaUrl(line)) return null;
        var part=/^(.*\/)([0-9]+)(\.mp4(?:\?[^\s]*)?)$/.exec(line);
        if (!part || String(Number(part[2]))!==part[2]) return null;
        var pattern=part[1]+'$Number$'+part[3];
        if (!template) { template=pattern; start=Number(part[2]); }
        if (pattern!==template || Number(part[2])!==start+durations.length) return null;
        durations.push(pending); total+=pending; pending=0;
        if (durations.length>2000) return null;
      }
    }
    if (!init || !template || !durations.length || pending) return null;
    var timeline=durations.map(function(d){ return '<S d="'+d+'"/>'; }).join('');
    var mpd='<MPD xmlns="urn:mpeg:dash:schema:mpd:2011" type="static" mediaPresentationDuration="PT'+(total/1000)+'S"><Period><AdaptationSet mimeType="audio/mp4"><Representation id="1" codecs="fLaC"><SegmentTemplate timescale="1000" startNumber="'+start+'" initialization="'+xml(init)+'" media="'+xml(template)+'"><SegmentTimeline>'+timeline+'</SegmentTimeline></SegmentTemplate></Representation></AdaptationSet></Period></MPD>';
    return {manifest:myspoti.util.base64Encode(mpd),mimeType:'audio/mp4',codec:'flac',durationMs:total,source:'Eclipse Cloud · FLAC'};
  }
  function playable(payload) {
    var r = streamObject(payload);
    if (!r || typeof r !== 'object') { log('stream: empty or invalid response'); return null; }
    var codec=s(r.codec || r.format).toLowerCase(), container=s(r.container).toLowerCase();
    var manifest=s(r.manifest).toLowerCase(), encrypted=r.encrypted === true || r.isEncrypted === true || !!r.drm || !!r.drmInfo || !!r.licenseUrl || !!r.licenseURL;
    log('stream: codec='+(codec||'?')+', container='+(container||'?')+', manifest='+(manifest||'?')+', drm='+(encrypted?'yes':'no'));
    if (encrypted) { log('stream: DRM required; clear FLAC cannot be provided'); return null; }
    if ((manifest==='hls' || s(r.format).toLowerCase()==='hls') && codec==='flac' && container==='fmp4') {
      if (!feature('audio.manifest')) { log('stream: this MySpoti version does not support FLAC manifests'); return null; }
      var playlist=s(r.url || r.streamURL || r.streamUrl);
      if (!/^https:\/\/api\.eclipsemusic\.app\/api\/tidal\/hls\//.test(playlist)) return null;
      try {
        var response=myspoti.http.get(playlist,{timeout:timeout(2000)});
        if (!response.ok) { log('playlist: HTTP '+response.status); return null; }
        var audio=hlsManifest(response.body);
        if (audio) { audio.bitDepth=Number(r.bitDepth)||undefined; audio.sampleRate=Number(r.sampleRate)||undefined; }
        log('stream: FLAC manifest '+(audio?'compatible':'unsupported'));
        return audio;
      } catch (e) { log('playlist: network/format unavailable'); return null; }
    }
    if (manifest==='hls' || manifest==='dash' || container==='fmp4') { log('stream: incompatible segmented audio'); return null; }
    var url=s(r.url || r.streamURL || r.streamUrl);
    if (!/^https:\/\/[^\s]+/i.test(url)) { log('stream: no direct HTTPS URL returned'); return null; }
    var fileFlac=/\.flac$/i.test(url.split('?')[0]);
    if (codec && ['flac','audio/flac','audio/x-flac'].indexOf(codec) < 0) { log('stream: codec is not FLAC'); return null; }
    if (container && container!=='flac' && container!=='none') { log('stream: container is not plain FLAC'); return null; }
    if (!codec && container!=='flac' && !fileFlac) { log('stream: FLAC format not verified'); return null; }
    var result={url:url,mimeType:'audio/flac',codec:'flac',source:'Eclipse Cloud · FLAC'};
    var bit=Number(r.bitDepth), hz=Number(r.sampleRate);
    if (bit>=8 && bit<=32) result.bitDepth=bit;
    if (hz>=8000 && hz<=768000) result.sampleRate=hz;
    if (r.headers && typeof r.headers==='object') {
      var safe={}, allow=['authorization','referer','user-agent','origin'];
      for (var k in r.headers) if (Object.prototype.hasOwnProperty.call(r.headers,k) && allow.indexOf(k.toLowerCase())>=0) safe[k]=s(r.headers[k]);
      if (Object.keys(safe).length) result.headers=safe;
    }
    var exp=Number(r.expiresAt);
    if (exp>0) {
      var delay=(exp<1e12?exp*1000:exp)-Date.now()-3000;
      if (delay<=0) { log('stream: URL has expired'); return null; }
      result.expiresInMs=Math.floor(delay);
    }
    log('stream: compatible direct FLAC found');
    return result;
  }
  function load(t) {
    deadline=Date.now()+14000;
    if (accountToken() && Date.now()-Number(myspoti.storage.get('session_checked')||0)>86400000) {
      var session=syncSession(accountToken());
      if (session.error) return session;
    }
    var base=baseUrl();
    if (!base) { log('configuration: invalid addon URL'); return {error:'config'}; }
    if (!s(t && t.title) || !s(t && t.artist)) { log('track: missing title/artist'); return {error:'track-metadata'}; }
    log('start: quality='+quality()+', ISRC='+(s(t.isrc)?'yes':'no'));
    var r=resolve(t,base,true);
    // Spotify can use a different ISRC for a reissue; retry by text only.
    if (r.miss && s(t.isrc)) {
      log('resolve: retrying text search without ISRC');
      r=resolve(t,base,false);
    }
    if (r.error) return r;
    if (r.miss) return {error:'no-match'};
    var id=r.id;
    var stream=jsonGet(base+'/stream?'+q({trackId:id,quality:quality(),appleQuality:quality()==='LOSSLESS'?'LOSSLESS':'HI_RES_MAX'}),'stream');
    if (stream.error) { stream.stage='stream'; return stream; }
    var audio=playable(stream.data);
    if (!audio) return {error:'unsupported'};
    return {audio:audio,isrcMatched:r.isrcMatched};
  }
  function fallback(r) {
    if (r.error==='no-match') return reason('not-found');
    if (r.error==='sign-in' || r.error==='config') return reason('sign-in','Check the URL and update your Eclipse token in settings.');
    if (r.error==='forbidden') return reason('sign-in','HTTP 403: check your account access and update the Eclipse token.');
    if (r.error==='rate-limited') {
      var limited=reason('rate-limited');
      if (limited) limited.retryAfterMs=r.retryAfterMs;
      return limited;
    }
    if (r.error==='network') return reason('network','Network error connecting to Eclipse.');
    if (r.error==='unsupported') return reason('quality-unavailable','The service returned a stream incompatible with clear FLAC.');
    return reason('server-down', (r.stage||'API')+': '+r.error);
  }
  myspoti.provide('audio-source',function(t){
    var r=load(t);
    if (r.audio) return r.audio;
    log('result: '+r.error+(r.stage ? ' ('+r.stage+')' : ''));
    return fallback(r);
  });
  myspoti.provide('download-source',function(t){
    var r=load(t);
    if (!r.audio) { log('download: '+r.error); return fallback(r); }
    var f=r.audio.manifest ? {manifest:r.audio.manifest,format:'dash-flac',provider:'Eclipse Cloud'} : {url:r.audio.url,format:'flac',provider:'Eclipse Cloud'};
    if(r.audio.headers) f.headers=r.audio.headers;
    if(r.audio.bitDepth) f.bitDepth=r.audio.bitDepth;
    if(r.audio.sampleRate) f.sampleRate=r.audio.sampleRate;
    if(r.isrcMatched) f.isrcMatched=true;
    return [f];
  });
  myspoti.on('setting',function(e){
    if (e.key==='account_token') {
      myspoti.storage.remove('session_token');
      myspoti.storage.remove('session_checked');
      log('settings: token updated');
    }
    if(e.key==='addon_url') log('settings: URL updated ('+(baseUrl()?'valid':'invalid')+')');
    if(e.key==='quality') log('settings: quality '+quality());
  });
  var connectWasAway=false, connectReturnUri='';
  myspoti.on('playback',function(e){
    if (myspoti.settings.get('connect_return')===false) return;
    if (e.source==='local' && e.origin==='audio-source' && e.providerId==='dev.personal.eclipseflacbridge') {
      if (e.type==='start' || e.type==='resume') { connectWasAway=false; connectReturnUri=''; }
      return;
    }
    if (e.source!=='spotify' || ['start','resume','progress','seek'].indexOf(e.type)<0) return;
    var uri=s(e.track && e.track.uri);
    if (!/^spotify:track:[A-Za-z0-9]{22}$/.test(uri)) return;
    try {
      var devices=myspoti.spotify.devices.list(), active=devices.filter(function(d){return d.active;});
      if (active.length!==1) return;
      if (!active[0].local) {
        if (!connectWasAway) log('connect: remote device confirmed; do not resume on phone');
        connectWasAway=true; connectReturnUri=''; return;
      }
      // A transient local echo before the remote takeover is never a return.
      if (!connectWasAway || connectReturnUri===uri) return;
      var state=myspoti.spotify.player.state(), current=myspoti.player.current();
      if (!state || state.isPaused || state.isBuffering || !state.item || state.item.uri!==uri || !current || current.uri!==uri) return;
      connectReturnUri=uri;
      if (myspoti.player.play()===false) { connectReturnUri=''; return; }
      log('connect: return to phone confirmed; resume requested from MySpoti');
    } catch (ignored) { log('connect: device state unavailable; playback left unchanged'); }
  });
  log('loaded: version 0.5.1');
})();
