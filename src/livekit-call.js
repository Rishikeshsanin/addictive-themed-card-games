// DeckVerse-only optional calls. Game state never depends on LiveKit.
// No media or SDK load starts until the player explicitly clicks Join Voice.
const SDK_URL = 'https://esm.sh/livekit-client@2.15.3';
const $ = id => document.getElementById(id);
let room = null, pendingRoom = null, pendingRequest = null, sdk = null;
let busy = false, minimized = false, manualMinimize = false, cameraFacing = 'user', activeEpoch = 0;
const attached = new Map();
const handlers = new WeakMap();
let previewTrack = null, previewElement = null;
const status = message => { const el = $('call-status'); if (el) el.textContent = message; };
const button = (id, visible) => $(id)?.classList.toggle('hidden', !visible);
const current = (candidate, epoch) => activeEpoch === epoch && (room === candidate || pendingRoom === candidate);
const micOn = () => Boolean(room?.localParticipant?.isMicrophoneEnabled);
const cameraOn = () => Boolean(room?.localParticipant?.isCameraEnabled);
function mobileLayout() {
 const dock = $('call-dock'); if (!dock) return;
 const mobile = typeof window !== 'undefined' && window.innerWidth <= 700;
 // Keep the call dock away from the category buttons on small screens.
 dock.style.top = mobile ? 'calc(env(safe-area-inset-top, 0px) + 72px)' : '';
 dock.style.bottom = mobile ? 'auto' : '';
 dock.style.maxHeight = mobile ? 'calc(100dvh - 90px)' : '';
 dock.style.overflowY = mobile ? 'auto' : '';
 if (!manualMinimize) minimized = mobile;
}
function syncControls() {
 const connected = Boolean(room);
 button('call-join', !connected);
 for (const id of ['call-mic', 'call-camera', 'call-leave']) button(id, connected);
 button('call-audio', Boolean(room && !room.canPlayAudio));
 button('call-flip', cameraOn());
 const join = $('call-join'); if (join) join.disabled = busy;
 const mic = $('call-mic'); if (mic) {
  mic.textContent = micOn() ? '🎤' : '🔇';
  mic.title = micOn() ? 'Mute microphone' : 'Unmute microphone';
  mic.setAttribute('aria-label', mic.title);
  mic.disabled = busy;
 }
 const cam = $('call-camera'); if (cam) {
  cam.textContent = cameraOn() ? '📷' : '📷 OFF';
  cam.title = cameraOn() ? 'Turn camera off' : 'Turn camera on';
  cam.setAttribute('aria-label', cam.title);
  cam.disabled = busy;
 }
 const flip = $('call-flip'); if (flip) flip.disabled = busy;
 const leave = $('call-leave'); if (leave) leave.disabled = false;
 const minimize = $('call-minimize'); if (minimize) {
  minimize.textContent = minimized ? '+' : '−';
  minimize.setAttribute('aria-label', minimized ? 'Expand call' : 'Minimize call');
 }
 $('call-dock')?.classList.toggle('minimized', minimized);
}
function detach(track, element) {
 try { if (element) track?.detach?.(element); } catch {}
 element?.remove();
}
function clearMedia() {
 for (const [track, element] of attached) detach(track, element);
 attached.clear();
 detach(previewTrack, previewElement);
 previewTrack = previewElement = null;
 for (const element of document.querySelectorAll('#call-dock audio, #local-video video, #remote-video video')) element.remove();
 const local = $('local-video'); if (local) { local.replaceChildren(); local.classList.add('hidden'); }
 const remote = $('remote-video'); if (remote) {
  const placeholder = document.createElement('span');
  placeholder.textContent = 'Friend’s video appears here when enabled';
  remote.replaceChildren(placeholder);
 }
}
function onTrack(track) {
 if (!track || !sdk || attached.has(track)) return;
 const target = track.kind === sdk.Track.Kind.Video ? $('remote-video') : $('call-dock');
 if (!target) return;
 const element = track.attach();
 element.autoplay = true; element.playsInline = true;
 if (track.kind === sdk.Track.Kind.Audio) {
  element.style.display = 'none';
 } else {
  // Multiple callers may publish cameras in a 3/4-player room.
  target.querySelector('span')?.remove();
  element.setAttribute('aria-label', 'Remote player video');
 }
 attached.set(track, element);
 target.appendChild(element);
}
function offTrack(track) {
 const element = attached.get(track);
 if (element) { detach(track, element); attached.delete(track); }
 if (track?.kind === sdk?.Track?.Kind.Video && !$('remote-video')?.querySelector('video')) {
  const c = $('remote-video'); if (c) c.textContent = 'Friend’s camera is off';
 }
}
function refreshLocal() {
 const box = $('local-video'); if (!box) return;
 detach(previewTrack, previewElement);
 previewTrack = previewElement = null;
 box.replaceChildren();
 const track = [...(room?.localParticipant?.videoTrackPublications?.values() || [])].find(p => p.track)?.track;
 if (track && cameraOn()) {
  const element = track.attach(); element.muted = true; element.autoplay = true; element.playsInline = true;
  box.appendChild(element); box.classList.remove('hidden');
  previewTrack = track; previewElement = element;
 } else box.classList.add('hidden');
}
function stopLocalTracks(candidate) {
 const participant = candidate?.localParticipant;
 if (!participant) return;
 for (const publications of [participant.audioTrackPublications, participant.videoTrackPublications]) {
  for (const pub of publications?.values?.() || []) {
   try { pub.track?.stop?.(); } catch {}
   try { pub.track?.detach?.()?.forEach(element => element.remove()); } catch {}
  }
 }
}
function unbind(candidate) {
 for (const [event, callback] of handlers.get(candidate) || []) candidate.off?.(event, callback);
 handlers.delete(candidate);
}
function cleanup(candidate) { if (candidate) { unbind(candidate); stopLocalTracks(candidate); } clearMedia(); }
function bindEvents(candidate, lib, epoch) {
 const events = [];
 const listen = (event, callback) => {
  if (event) { candidate.on(event, callback); events.push([event, callback]); }
 };
 listen(lib.RoomEvent.TrackSubscribed, track => { if (current(candidate, epoch)) onTrack(track); });
 listen(lib.RoomEvent.TrackUnsubscribed, track => { if (current(candidate, epoch)) offTrack(track); });
 listen(lib.RoomEvent.ParticipantDisconnected, participant => {
  if (!current(candidate, epoch)) return;
  for (const pub of participant?.trackPublications?.values?.() || []) if (pub.track) offTrack(pub.track);
  if (!attached.size) status('Your friend left the call · gameplay continues');
 });
 listen(lib.RoomEvent.Reconnecting, () => { if (current(candidate, epoch)) status('Reconnecting voice… your cards still work'); });
 listen(lib.RoomEvent.Reconnected, () => {
  if (!current(candidate, epoch)) return;
  status('Voice reconnected · check your mic and camera'); syncControls(); refreshLocal();
 });
 listen(lib.RoomEvent.Disconnected, () => {
  if (!current(candidate, epoch)) return;
  ++activeEpoch; room = pendingRoom = null; busy = false;
  cleanup(candidate); syncControls();
  status('Call ended or reconnection failed · tap Join Voice to try again');
 });
 listen(lib.RoomEvent.AudioPlaybackStatusChanged, () => {
  if (!current(candidate, epoch)) return;
  status(candidate.canPlayAudio ? 'Voice audio is available' : 'Tap ENABLE AUDIO to hear other players');
  syncControls();
 });
 for (const event of [lib.RoomEvent.LocalTrackPublished, lib.RoomEvent.LocalTrackUnpublished,
  lib.RoomEvent.TrackMuted, lib.RoomEvent.TrackUnmuted]) {
  listen(event, () => { if (current(candidate, epoch)) { syncControls(); refreshLocal(); } });
 }
 handlers.set(candidate, events);
}
function failureMessage(error, media = 'call') {
 const name = error?.name || '';
 if (/NotAllowed|PermissionDenied|SecurityError/.test(name)) return `${media} permission denied · allow it in browser settings and try again`;
 if (/NotFound|DevicesNotFound|Overconstrained/.test(name)) return `No compatible ${media} device found`;
 if (/NotReadable|TrackStart/.test(name)) return `${media} is in use by another app or unavailable`;
 if (name === 'AbortError') return `${media} was interrupted · try again`;
 return `${media} unavailable · gameplay continues`;
}
export async function getCallAvailability() {
 try { const r = await fetch('/api/livekit-token', { cache: 'no-store' }); const j = await r.json(); return Boolean(r.ok && j.configured); }
 catch { return false; }
}
export async function connectCall(getSession, showToast = () => {}) {
 if (busy || room) return;
 const session = getSession();
 if (!session || session.mode !== 'remote') { showToast('VOICE & VIDEO ARE FOR REMOTE ROOMS'); return; }
 const epoch = ++activeEpoch;
 busy = true; status('Connecting private voice call…'); syncControls();
 let connecting = null;
 const request = new AbortController(); pendingRequest = request;
 try {
  const response = await fetch('/api/livekit-token', {
   method: 'POST', cache: 'no-store', signal: request.signal,
   headers: {'content-type':'application/json'}, body: JSON.stringify({code:session.code, token:session.token})
  });
  if (epoch !== activeEpoch) return;
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
   if (response.status === 429) throw Error('Call limit reached · try again shortly');
   if (response.status === 401 || response.status === 403) throw Error('Call session expired · rejoin the game room');
   throw Error(typeof body.error === 'string' ? body.error : 'Calling service unavailable');
  }
  if (!body.url || !body.token) throw Error('Calling service returned an incomplete response');
  sdk ??= await import(SDK_URL);
  if (epoch !== activeEpoch) return;
  connecting = new sdk.Room({adaptiveStream:true, dynacast:true, stopLocalTrackOnUnpublish:true});
  pendingRoom = connecting;
  bindEvents(connecting, sdk, epoch);
  await connecting.connect(body.url, body.token, {autoSubscribe:true});
  if (epoch !== activeEpoch) return;
  room = connecting; pendingRoom = null;
  for (const participant of room.remoteParticipants.values()) {
   for (const pub of participant.trackPublications.values()) if (pub.track) onTrack(pub.track);
  }
  // Join Voice is an explicit player action. Never restore capture automatically on page load.
  try {
   await room.localParticipant.setMicrophoneEnabled(true);
   if (epoch !== activeEpoch) return;
   status('Voice connected · camera off by default');
  } catch (error) {
   if (epoch !== activeEpoch) return;
   status(failureMessage(error, 'Microphone') + ' · listen-only call connected');
   showToast('MICROPHONE UNAVAILABLE · LISTEN-ONLY CALL');
  }
  if (!room.canPlayAudio) status('Connected · tap ENABLE AUDIO to hear other players');
 } catch (error) {
  if (epoch === activeEpoch) {
   room = pendingRoom = null;
   const message = error?.name === 'AbortError' ? 'Call request cancelled' :
    error instanceof TypeError ? 'Network or calling SDK unavailable · gameplay continues' :
    (error?.message || 'Call unavailable · gameplay continues');
   status(message); showToast(message);
  }
 } finally {
  if (connecting && room !== connecting) {
   cleanup(connecting);
   try { await connecting.disconnect(); } catch {}
  }
  if (pendingRequest === request) pendingRequest = null;
  if (epoch === activeEpoch) { busy = false; syncControls(); }
 }
}
export async function enableCallAudio(showToast = () => {}) {
 const active = room; if (!active) return;
 try { await active.startAudio(); status(active.canPlayAudio ? 'Audio playback enabled' : 'Still blocked · check browser sound settings'); }
 catch { showToast('AUDIO PLAYBACK BLOCKED · TRY ENABLE AUDIO AGAIN'); status('Audio is blocked · gameplay continues'); }
 syncControls();
}
export async function toggleMicCall(showToast = () => {}) {
 const active = room; if (!active || busy) return;
 busy = true; syncControls();
 try {
  await active.localParticipant.setMicrophoneEnabled(!active.localParticipant.isMicrophoneEnabled);
  if (room === active) status(micOn() ? 'Microphone on' : 'Microphone muted');
 } catch (error) { if (room === active) { status(failureMessage(error, 'Microphone')); showToast('MICROPHONE UNAVAILABLE'); } }
 finally { busy = false; syncControls(); }
}
export async function toggleCameraCall(showToast = () => {}) {
 const active = room; if (!active || busy) return;
 busy = true; syncControls();
 try {
  await active.localParticipant.setCameraEnabled(!active.localParticipant.isCameraEnabled, {facingMode:cameraFacing});
  if (room === active) { refreshLocal(); status(cameraOn() ? 'Camera enabled' : 'Camera off · voice remains connected'); }
 } catch (error) { if (room === active) { status(failureMessage(error, 'Camera')); showToast('CAMERA UNAVAILABLE · AUDIO STILL WORKS'); } }
 finally { busy = false; syncControls(); }
}
export async function flipCameraCall(showToast = () => {}) {
 const active = room; if (!active?.localParticipant?.isCameraEnabled || busy) return;
 busy = true; syncControls();
 const next = cameraFacing === 'user' ? 'environment' : 'user';
 try {
  const track = [...active.localParticipant.videoTrackPublications.values()].find(pub => pub.track)?.track;
  if (!track?.restartTrack) throw Error('Camera switching unsupported');
  await track.restartTrack({facingMode:next});
  if (room === active) { cameraFacing = next; refreshLocal(); status('Camera switched'); }
 } catch { if (room === active) showToast('CAMERA SWITCHING NOT SUPPORTED ON THIS DEVICE'); }
 finally { busy = false; syncControls(); }
}
export async function disconnectCall() {
 ++activeEpoch;
 pendingRequest?.abort(); pendingRequest = null;
 const previous = room || pendingRoom;
 room = pendingRoom = null; busy = false;
 cleanup(previous);
 syncControls(); status('Optional voice call · camera off by default');
 if (previous) { try { await previous.disconnect(); } catch {} }
}
export function minimizeCall() { manualMinimize = true; minimized = !minimized; syncControls(); }
export function initCallControls(getSession, showToast) {
 $('call-join').onclick = () => connectCall(getSession, showToast);
 $('call-leave').onclick = () => disconnectCall();
 $('call-audio').onclick = () => enableCallAudio(showToast);
 $('call-mic').onclick = () => toggleMicCall(showToast);
 $('call-camera').onclick = () => toggleCameraCall(showToast);
 $('call-flip').onclick = () => flipCameraCall(showToast);
 $('call-minimize').onclick = () => minimizeCall();
 if (typeof window !== 'undefined') {
  // Initialization is once per page. No automatic media restart on visibility/refresh.
  window.addEventListener('resize', () => { mobileLayout(); syncControls(); });
  window.addEventListener('pagehide', () => { void disconnectCall(); });
  document.addEventListener('visibilitychange', () => {
   if (!room) return;
   if (document.visibilityState === 'hidden') status('Call in background · device may suspend media');
   else { syncControls(); status(room.state === 'reconnecting' ? 'Reconnecting voice…' : 'Call active · check audio after returning'); }
  });
 }
 clearMedia(); mobileLayout(); syncControls();
}
