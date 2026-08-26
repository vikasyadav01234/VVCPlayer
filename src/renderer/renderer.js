'use strict';
const { ipcRenderer } = require('electron');
const path = require('path');

// ── State ─────────────────────────────────────────────────────
const S = {
  playlist: [], idx: -1, playing: false, muted: false,
  volume: 80, speed: 1.0, shuffle: false, repeat: 'none',
  eqOn: true, eqBands: [0,0,0,0,0,0,0,0,0,0],
  pip: false, party: false, dragging: false, hideTimer: null
};

// ── EQ presets ────────────────────────────────────────────────
const EQ_P = {
  flat:      [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  bass:      [7, 6, 5, 2, 0, 0,-1,-2,-2,-2],
  voice:     [-2,-1, 0, 2, 5, 5, 3, 1, 0,-1],
  rock:      [5, 4, 2, 0,-2,-2, 0, 3, 5, 6],
  pop:       [-2, 0, 2, 4, 4, 2, 0,-1,-2,-2],
  classical: [5, 4, 3, 2, 0, 0, 0, 2, 3, 4],
  club:      [0, 0, 4, 4, 4, 3, 2, 0, 0, 0],
};
const EQ_LABELS = ['31Hz','62Hz','125Hz','250Hz','500Hz','1kHz','2kHz','4kHz','8kHz','16kHz'];
const SPEEDS    = [0.25, 0.5, 0.75, 1.0, 1.25, 1.5, 1.75, 2.0, 3.0];

// ── Audio context for EQ ──────────────────────────────────────
let audioCtx = null, mediaSource = null, gainNode = null;
const eqFilters = [];

function initAudio() {
  if (audioCtx) return;
  audioCtx = new AudioContext();
  mediaSource = audioCtx.createMediaElementSource(video);
  gainNode = audioCtx.createGain();
  gainNode.gain.value = 1;
  const freqs = [31,62,125,250,500,1000,2000,4000,8000,16000];
  let prev = mediaSource;
  freqs.forEach((freq, i) => {
    const f = audioCtx.createBiquadFilter();
    f.type = 'peaking'; f.frequency.value = freq; f.Q.value = 1.4;
    f.gain.value = S.eqBands[i];
    prev.connect(f); eqFilters.push(f); prev = f;
  });
  prev.connect(gainNode);
  gainNode.connect(audioCtx.destination);
}

function applyEQ() {
  eqFilters.forEach((f, i) => f.gain.value = S.eqOn ? S.eqBands[i] : 0);
}

// ── DOM shortcuts ─────────────────────────────────────────────
const $ = id => document.getElementById(id);
const video = $('video');

// ── Helpers ───────────────────────────────────────────────────
function fmt(s) {
  if (!isFinite(s) || s < 0) return '0:00';
  const h = Math.floor(s/3600), m = Math.floor((s%3600)/60), sec = Math.floor(s%60);
  if (h) return `${h}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
  return `${m}:${String(sec).padStart(2,'0')}`;
}

let toastT;
function toast(msg, ms = 2200) {
  const el = $('toast'); el.textContent = msg;
  el.classList.add('show'); clearTimeout(toastT);
  toastT = setTimeout(() => el.classList.remove('show'), ms);
}

function osd(emoji) {
  const el = $('osd'); el.textContent = emoji;
  el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop');
}

function setStatus(msg) { $('statusMsg').textContent = msg; }

function updateVolGradient(val) {
  $('volSlider').style.background =
    `linear-gradient(90deg, #6c63ff ${val}%, rgba(255,255,255,0.2) ${val}%)`;
}

// ── Window Controls ───────────────────────────────────────────
$('btnMin').onclick   = () => ipcRenderer.send('window-minimize');
$('btnMax').onclick   = () => ipcRenderer.send('window-maximize');
$('btnClose').onclick = () => ipcRenderer.send('window-close');
$('titlebar').addEventListener('dblclick', () => ipcRenderer.send('window-maximize'));

// ── Open Files ────────────────────────────────────────────────
async function openFiles() {
  const files = await ipcRenderer.invoke('open-file-dialog');
  if (files.length) addFiles(files, true);
}
$('btnAdd').onclick          = openFiles;
$('btnWelcomeOpen').onclick  = openFiles;
$('btnWelcomeParty').onclick = () => openPanel('watchOverlay');

// ── Playlist ──────────────────────────────────────────────────
const VIDEO_EXTS = new Set(['mp4','mkv','avi','mov','wmv','flv','webm','m4v','ts','3gp','ogv','m2ts','vob']);

function addFiles(files, autoPlay) {
  const wasEmpty = S.playlist.length === 0;
  const startIdx = S.playlist.length;
  files.forEach(fp => {
    const name = path.basename(fp);
    const ext  = path.extname(fp).toLowerCase().slice(1);
    S.playlist.push({ path: fp, name, ext, isVideo: VIDEO_EXTS.has(ext) });
  });
  renderPlaylist();
  if (autoPlay && wasEmpty)   loadTrack(0);
  else if (autoPlay)          loadTrack(startIdx);
}

function renderPlaylist() {
  const empty = S.playlist.length === 0;
  $('plEmpty').style.display = empty ? '' : 'none';
  $('plCount').textContent = `${S.playlist.length} item${S.playlist.length !== 1 ? 's' : ''}`;

  document.querySelectorAll('.pl-item').forEach(e => e.remove());

  S.playlist.forEach((item, i) => {
    const div = document.createElement('div');
    div.className = 'pl-item' + (i === S.idx ? ' active' : '');
    const playing = i === S.idx;
    const numStr  = playing ? (S.playing ? '▶' : '❚❚') : String(i + 1);

    div.innerHTML = `
      <span class="pl-num">${numStr}</span>
      <span class="pl-icon">
        ${item.isVideo
          ? '<svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M17 10.5V7a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h12a1 1 0 001-1v-3.5l4 4v-11l-4 4z"/></svg>'
          : '<svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/></svg>'}
      </span>
      <div class="pl-info">
        <div class="pl-name" title="${item.name}">${item.name}</div>
        <div class="pl-ext">${item.ext.toUpperCase()}</div>
      </div>
      <button class="pl-rm" data-i="${i}" title="Remove">✕</button>`;

    div.querySelector('.pl-rm').addEventListener('click', e => {
      e.stopPropagation();
      removeTrack(+e.currentTarget.dataset.i);
    });
    div.addEventListener('dblclick', () => loadTrack(i));
    $('playlist').appendChild(div);
  });
}

function removeTrack(i) {
  S.playlist.splice(i, 1);
  if (i === S.idx) {
    video.pause(); video.src = ''; S.idx = -1; S.playing = false;
    $('welcome').classList.remove('hidden'); updatePlayBtn();
  } else if (i < S.idx) S.idx--;
  renderPlaylist();
}

$('btnClear').onclick = () => {
  S.playlist = []; S.idx = -1;
  video.pause(); video.src = ''; S.playing = false;
  $('welcome').classList.remove('hidden');
  updatePlayBtn(); renderPlaylist();
  $('tbFile').textContent = 'No file loaded';
  setStatus('Playlist cleared');
};

// ── Load & Play ───────────────────────────────────────────────
function loadTrack(i) {
  if (i < 0 || i >= S.playlist.length) return;
  S.idx = i;
  const item = S.playlist[i];

  video.src = item.path;
  video.playbackRate = S.speed;
  video.volume = S.volume / 100;
  video.muted  = S.muted;

  video.play().then(() => {
    if (audioCtx?.state === 'suspended') audioCtx.resume();
    initAudio(); applyEQ();
    S.playing = true; updatePlayBtn();
    $('welcome').classList.add('hidden');
    $('tbFile').textContent = item.name;
    $('ctrlNow').textContent = item.name;
    $('statusDot').style.display = '';
    setStatus(`Playing — ${item.name}`);
    renderPlaylist();
    if (S.party) ipcRenderer.send('watch-party-broadcast',
      { type:'sync', action:'load', src: item.path, currentTime: 0 });
  }).catch(err => setStatus(`Error: ${err.message}`));
}

// ── Playback ──────────────────────────────────────────────────
function togglePlay() {
  if (!video.src) { openFiles(); return; }
  if (video.paused) {
    video.play(); S.playing = true; osd('▶');
    if (S.party) ipcRenderer.send('watch-party-broadcast', { type:'sync', action:'play', currentTime: video.currentTime });
  } else {
    video.pause(); S.playing = false; osd('⏸');
    if (S.party) ipcRenderer.send('watch-party-broadcast', { type:'sync', action:'pause', currentTime: video.currentTime });
  }
  updatePlayBtn();
}

function updatePlayBtn() {
  $('icPlay').style.display  = S.playing ? 'none' : '';
  $('icPause').style.display = S.playing ? '' : 'none';
  renderPlaylist();
}

function playNext() {
  let i = S.shuffle ? Math.floor(Math.random() * S.playlist.length) : S.idx + 1;
  if (i >= S.playlist.length) { if (S.repeat === 'all') i = 0; else return; }
  loadTrack(i);
}

$('btnPlay').onclick = togglePlay;
$('btnStop').onclick = () => {
  video.pause(); video.currentTime = 0; S.playing = false; updatePlayBtn(); osd('⏹');
  setStatus('Stopped');
};
$('btnPrev').onclick = () => {
  if (video.currentTime > 3) { video.currentTime = 0; return; }
  let i = S.shuffle ? Math.floor(Math.random() * S.playlist.length) : S.idx - 1;
  if (i < 0) i = S.playlist.length - 1;
  loadTrack(i);
};
$('btnNext').onclick = playNext;

video.addEventListener('ended', () => {
  S.playing = false; updatePlayBtn();
  if (S.repeat === 'one') { video.play(); S.playing = true; updatePlayBtn(); return; }
  playNext();
});

// ── Volume ────────────────────────────────────────────────────
$('volSlider').addEventListener('input', e => {
  S.volume = parseInt(e.target.value);
  video.volume = S.volume / 100;
  $('volLbl').textContent = S.volume + '%';
  updateVolGradient(S.volume);
});
updateVolGradient(80);

$('btnMute').onclick = () => {
  S.muted = !S.muted; video.muted = S.muted;
  $('icVol').style.display  = S.muted ? 'none' : '';
  $('icMute').style.display = S.muted ? '' : 'none';
  osd(S.muted ? '🔇' : '🔊');
};

// ── Speed ─────────────────────────────────────────────────────
$('btnSpeedUp').onclick = () => changeSpeed(1);
$('btnSpeedDn').onclick = () => changeSpeed(-1);

function changeSpeed(dir) {
  let i = SPEEDS.indexOf(S.speed);
  if (i === -1) i = SPEEDS.findIndex(s => s >= S.speed);
  i = Math.max(0, Math.min(SPEEDS.length - 1, i + dir));
  S.speed = SPEEDS[i];
  video.playbackRate = S.speed;
  $('spLbl').textContent = S.speed + 'x';
  toast(`Speed: ${S.speed}x`);
}

// ── Progress ──────────────────────────────────────────────────
video.addEventListener('timeupdate', () => {
  if (S.dragging || !video.duration) return;
  const pct = (video.currentTime / video.duration) * 100;
  $('progFill').style.width  = pct + '%';
  $('progThumb').style.left  = pct + '%';
  $('progTime').textContent  = `${fmt(video.currentTime)} / ${fmt(video.duration)}`;
});

video.addEventListener('progress', () => {
  if (video.buffered.length && video.duration) {
    const buf = (video.buffered.end(video.buffered.length - 1) / video.duration) * 100;
    $('progBuf').style.width = buf + '%';
  }
});

video.addEventListener('loadedmetadata', () => {
  $('statusMeta').textContent = video.videoWidth
    ? `${video.videoWidth}×${video.videoHeight} · ${fmt(video.duration)}`
    : fmt(video.duration);
});

const pw = $('progWrap');
pw.addEventListener('mousedown', e => { S.dragging = true; seekAt(e); });
document.addEventListener('mousemove', e => { if (S.dragging) seekAt(e); });
document.addEventListener('mouseup', () => { S.dragging = false; });

pw.addEventListener('mousemove', e => {
  if (!video.duration) return;
  const r = pw.getBoundingClientRect();
  const p = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
  const tip = $('progTip');
  tip.textContent = fmt(p * video.duration);
  tip.style.left  = (p * 100) + '%';
});

function seekAt(e) {
  if (!video.duration) return;
  const r = pw.getBoundingClientRect();
  const p = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
  video.currentTime = p * video.duration;
  $('progFill').style.width = (p * 100) + '%';
  $('progThumb').style.left = (p * 100) + '%';
  if (S.party) ipcRenderer.send('watch-party-broadcast',
    { type:'sync', action:'seek', currentTime: video.currentTime });
}

// ── Controls auto-hide ────────────────────────────────────────
const vidWrap = $('vidWrap');
const overlay = $('ctrlOverlay');

function showControls() {
  vidWrap.classList.add('cursor-on');
  overlay.classList.add('on');
  clearTimeout(S.hideTimer);
  if (S.playing) S.hideTimer = setTimeout(hideControls, 3000);
}
function hideControls() {
  vidWrap.classList.remove('cursor-on');
  overlay.classList.remove('on');
}

vidWrap.addEventListener('mousemove', showControls);
vidWrap.addEventListener('mouseleave', hideControls);
vidWrap.addEventListener('click', e => {
  if (e.target.closest('.ctrl-overlay')) return;
  if (e.target.closest('.welcome'))      return;
  if (e.target.closest('.drop-zone'))    return;
  togglePlay();
});
vidWrap.addEventListener('dblclick', e => {
  if (e.target.closest('.ctrl-overlay')) return;
  if (e.target.closest('.welcome'))      return;
  toggleFS();
});

// ── Fullscreen ────────────────────────────────────────────────
$('btnFS').onclick = toggleFS;
function toggleFS() {
  if (!document.fullscreenElement) vidWrap.requestFullscreen();
  else document.exitFullscreen();
}
document.addEventListener('fullscreenchange', () => {
  $('btnFS').classList.toggle('on', !!document.fullscreenElement);
});

// ── PiP ───────────────────────────────────────────────────────
$('btnPiP').onclick = togglePiP;
function togglePiP() {
  if (S.pip) {
    ipcRenderer.send('pip-close'); S.pip = false;
    $('btnPiP').classList.remove('on');
  } else {
    if (!video.src) { toast('Nothing playing!'); return; }
    ipcRenderer.send('pip-open', {
      src: video.src,
      title: S.playlist[S.idx]?.name || 'VVC Player'
    });
    S.pip = true; $('btnPiP').classList.add('on');
    toast('📺 PiP opened');
  }
}
ipcRenderer.on('pip-closed', () => { S.pip = false; $('btnPiP').classList.remove('on'); });
video.addEventListener('timeupdate', () => {
  if (S.pip) ipcRenderer.send('pip-sync', { currentTime: video.currentTime, paused: video.paused });
});

// ── Shuffle & Repeat ─────────────────────────────────────────
$('btnShuffle').onclick = () => {
  S.shuffle = !S.shuffle;
  $('btnShuffle').classList.toggle('active', S.shuffle);
  toast(S.shuffle ? '🔀 Shuffle ON' : 'Shuffle OFF');
};
const RM = ['none','one','all'];
$('btnRepeat').onclick = () => {
  S.repeat = RM[(RM.indexOf(S.repeat) + 1) % 3];
  $('btnRepeat').classList.toggle('active', S.repeat !== 'none');
  const msgs = { none:'Repeat OFF', one:'🔂 Repeat One', all:'🔁 Repeat All' };
  toast(msgs[S.repeat]);
};

// ── Subtitles ─────────────────────────────────────────────────
$('btnSubs').onclick = () => {
  const tracks = video.textTracks;
  let hasVis = false;
  for (let t of tracks) if (t.mode === 'showing') hasVis = true;
  for (let t of tracks) t.mode = hasVis ? 'hidden' : 'showing';
  toast(hasVis ? 'Subtitles OFF' : 'Subtitles ON');
};

// ── Equalizer ─────────────────────────────────────────────────
function buildEQ() {
  const wrap = $('eqBands'); wrap.innerHTML = '';
  EQ_LABELS.forEach((lbl, i) => {
    const b = document.createElement('div');
    b.className = 'eq-band';
    b.innerHTML = `
      <span class="eq-val" id="ev${i}">${S.eqBands[i]>0?'+':''}${S.eqBands[i]}dB</span>
      <div class="eq-slider-wrap">
        <input type="range" class="eq-sl" id="es${i}" min="-12" max="12" step="0.5" value="${S.eqBands[i]}">
      </div>
      <span class="eq-lbl">${lbl}</span>`;
    b.querySelector(`#es${i}`).addEventListener('input', e => {
      S.eqBands[i] = parseFloat(e.target.value);
      $(`ev${i}`).textContent = `${S.eqBands[i]>0?'+':''}${S.eqBands[i]}dB`;
      applyEQ();
      document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('on'));
    });
    wrap.appendChild(b);
  });
}
buildEQ();

document.querySelectorAll('.preset-btn').forEach(btn => {
  btn.onclick = () => {
    const vals = EQ_P[btn.dataset.preset];
    S.eqBands = [...vals];
    vals.forEach((v, i) => {
      $(`es${i}`).value = v;
      $(`ev${i}`).textContent = `${v>0?'+':''}${v}dB`;
    });
    applyEQ();
    document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('on'));
    btn.classList.add('on');
    toast(`🎚️ ${btn.textContent}`);
  };
});

$('eqToggle').onchange = e => {
  S.eqOn = e.target.checked; applyEQ();
  toast(S.eqOn ? '🎚️ EQ On' : 'EQ Off');
};

// ── Panels ────────────────────────────────────────────────────
function openPanel(id)  { $(id).classList.add('open'); }
function closePanel(id) { $(id).classList.remove('open'); }

$('btnEQ').onclick        = () => openPanel('eqOverlay');
$('btnEQClose').onclick   = () => closePanel('eqOverlay');
$('btnWatchParty').onclick= () => openPanel('watchOverlay');
$('btnWatchClose').onclick= () => closePanel('watchOverlay');

['eqOverlay','watchOverlay'].forEach(id =>
  $(id).addEventListener('click', e => { if (e.target.id === id) closePanel(id); })
);

// ── Watch Party Tabs ─────────────────────────────────────────
document.querySelectorAll('.w-tab').forEach(tab => {
  tab.onclick = () => {
    document.querySelectorAll('.w-tab').forEach(t => t.classList.remove('on'));
    tab.classList.add('on');
    $('tabHost').style.display = tab.dataset.tab === 'host' ? '' : 'none';
    $('tabJoin').style.display = tab.dataset.tab === 'join' ? '' : 'none';
  };
});

$('btnHost').onclick = async () => {
  const port = parseInt($('hostPort').value) || 8765;
  const res = await ipcRenderer.invoke('watch-party-host', port);
  if (res.success) {
    $('codeBox').style.display = '';
    $('roomCode').textContent = res.code;
    $('btnHost').style.display = 'none';
    $('chatSection').style.display = '';
    S.party = true;
    $('btnWatchParty').classList.add('on');
    $('statusParty').textContent = '🟢 Hosting';
    toast('🌐 Watch Party started!', 3000);
  } else toast('❌ Error: ' + res.error);
};

$('btnStopParty').onclick = () => {
  ipcRenderer.send('watch-party-stop'); S.party = false;
  $('codeBox').style.display = 'none';
  $('btnHost').style.display = '';
  $('chatSection').style.display = 'none';
  $('btnWatchParty').classList.remove('on');
  $('statusParty').textContent = '';
  toast('Watch Party stopped');
};

$('btnCopy').onclick = () => {
  navigator.clipboard.writeText($('roomCode').textContent)
    .then(() => toast('✅ Code copied!'));
};

$('btnJoin').onclick = async () => {
  const code = $('joinCode').value.trim();
  if (!code) { toast('Enter a room code!'); return; }
  try {
    const dec = Buffer.from(code, 'base64').toString('utf8');
    const [host, port] = dec.split(':');
    const res = await ipcRenderer.invoke('watch-party-join', { host, port: parseInt(port) });
    if (res.success) {
      S.party = true; $('chatSection').style.display = '';
      $('btnWatchParty').classList.add('on');
      $('statusParty').textContent = '🟢 In Party';
      toast('🌐 Joined Watch Party!', 3000);
    } else toast('❌ ' + res.error);
  } catch { toast('❌ Invalid room code'); }
};

function sendChat() {
  const inp = $('chatInp'), txt = inp.value.trim();
  if (!txt) return;
  ipcRenderer.send('watch-party-broadcast', { type:'chat', text: txt });
  addChatMsg({ from:'You', text: txt });
  inp.value = '';
}
$('btnSend').onclick = sendChat;
$('chatInp').addEventListener('keydown', e => { if (e.key === 'Enter') sendChat(); });

function addChatMsg(m) {
  const msgs = $('chatMsgs');
  const d = document.createElement('div');
  const sys = !m.from || m.type === 'system';
  d.className = 'chat-msg' + (sys ? ' sys' : '');
  if (!sys) d.innerHTML = `<span class="chat-from">${m.from}</span>`;
  const t = document.createElement('div');
  t.className = 'chat-text'; t.textContent = m.text || m.from;
  d.appendChild(t); msgs.appendChild(d);
  msgs.scrollTop = msgs.scrollHeight;
}

ipcRenderer.on('watch-guest-joined', (_, info) =>
  addChatMsg({ type:'system', text:`👋 ${info.name} joined (${info.count} in room)` }));
ipcRenderer.on('watch-chat-msg', (_, m) => addChatMsg(m));
ipcRenderer.on('watch-sync', (_, d) => {
  if (d.action === 'play')  { video.currentTime = d.currentTime; video.play(); S.playing = true; updatePlayBtn(); }
  if (d.action === 'pause') { video.pause(); S.playing = false; updatePlayBtn(); }
  if (d.action === 'seek')  { video.currentTime = d.currentTime; }
  if (d.action === 'load' && d.src) {
    const i = S.playlist.findIndex(p => p.path === d.src);
    if (i >= 0) loadTrack(i);
  }
});

// ── Keyboard Shortcuts ────────────────────────────────────────
document.addEventListener('keydown', e => {
  const tag = document.activeElement.tagName.toLowerCase();
  if (['input','textarea'].includes(tag)) return;
  switch (e.code) {
    case 'Space':      e.preventDefault(); togglePlay(); break;
    case 'ArrowLeft':  e.preventDefault(); video.currentTime = Math.max(0, video.currentTime - (e.shiftKey?30:5)); osd('⏪'); break;
    case 'ArrowRight': e.preventDefault(); video.currentTime = Math.min(video.duration||0, video.currentTime + (e.shiftKey?30:5)); osd('⏩'); break;
    case 'ArrowUp':    e.preventDefault(); S.volume = Math.min(100, S.volume+5); $('volSlider').value = S.volume; $('volSlider').dispatchEvent(new Event('input')); osd('🔊'); break;
    case 'ArrowDown':  e.preventDefault(); S.volume = Math.max(0, S.volume-5);   $('volSlider').value = S.volume; $('volSlider').dispatchEvent(new Event('input')); osd('🔉'); break;
    case 'KeyM': $('btnMute').click(); break;
    case 'KeyF': toggleFS(); break;
    case 'KeyP': if (e.altKey) { e.preventDefault(); togglePiP(); } break;
    case 'KeyE': openPanel('eqOverlay'); break;
    case 'KeyN': $('btnNext').click(); break;
    case 'KeyB': $('btnPrev').click(); break;
    case 'Period': changeSpeed(1); break;
    case 'Comma':  changeSpeed(-1); break;
  }
});

// ── Drag & Drop ───────────────────────────────────────────────
window.handleFileDrop = e => {
  e.preventDefault();
  const files = Array.from(e.dataTransfer.files).map(f => f.path).filter(Boolean);
  if (files.length) addFiles(files, true);
  $('dropZone').classList.remove('show');
};

document.body.addEventListener('dragenter', () => $('dropZone').classList.add('show'));
document.body.addEventListener('dragleave', e => {
  if (!e.relatedTarget || !document.body.contains(e.relatedTarget))
    $('dropZone').classList.remove('show');
});

console.log('%cVVC Player ready', 'color:#6c63ff;font-weight:700;font-size:15px');

