// DeckVerse-only optional calls. Media state never participates in game resolution.
// The LiveKit SDK is loaded on demand, only after an explicit player click.
const SDK_URL='https://esm.sh/livekit-client@2.15.3';
const $=id=>document.getElementById(id);
let room=null, sdk=null, busy=false, minimized=false, cameraFacing='user',localMedia=null;
let activeEpoch=0;
const status=(message)=>{if($('call-status'))$('call-status').textContent=message};
const button=(id,visible)=>$(id)?.classList.toggle('hidden',!visible);
const notify=()=>{};
function syncControls(){
 const connected=Boolean(room);
 button('call-join',!connected);for(const id of ['call-mic','call-camera','call-leave'])button(id,connected);
 button('call-flip',Boolean(room?.localParticipant?.isCameraEnabled));
 if($('call-join'))$('call-join').disabled=busy;
 if($('call-mic')){$('call-mic').textContent=room?.localParticipant.isMicrophoneEnabled?'🎤':'🔇';$('call-mic').title=room?.localParticipant.isMicrophoneEnabled?'Mute microphone':'Unmute microphone'}
 if($('call-camera')){$('call-camera').textContent=room?.localParticipant.isCameraEnabled?'📷':'📷 OFF';$('call-camera').title=room?.localParticipant.isCameraEnabled?'Turn camera off':'Turn camera on'}
 if($('call-minimize'))$('call-minimize').textContent=minimized?'+':'−';
 $('call-dock')?.classList.toggle('minimized',minimized);
}
function clearMedia(){
 for(const el of document.querySelectorAll('#call-dock audio'))el.remove();
 for(const el of ['local-video','remote-video']){const container=$(el);if(!container)continue;container.replaceChildren();if(el==='local-video')container.classList.add('hidden');}
 localMedia=null;
 const placeholder=document.createElement('span');placeholder.textContent='Friend’s video appears here when enabled';$('remote-video')?.appendChild(placeholder);
}
function onTrack(track){if(!track||!sdk)return;const container=$('remote-video');if(!container)return;const element=track.attach();element.autoplay=true;element.playsInline=true;if(track.kind===sdk.Track.Kind.Video){container.replaceChildren(element)}else{element.style.display='none';document.getElementById('call-dock')?.appendChild(element)}}
function offTrack(track){try{for(const el of track.detach())el.remove()}catch{}if(track.kind===sdk?.Track?.Kind.Video){const c=$('remote-video');if(c&&!c.querySelector('video')){c.textContent='Friend’s camera is off';}}}
function refreshLocal(){const box=$('local-video');if(!box||!room)return;box.replaceChildren();const camera=room.localParticipant.videoTrackPublications.values().next().value?.track;if(camera&&room.localParticipant.isCameraEnabled){const v=camera.attach();v.muted=true;v.autoplay=true;v.playsInline=true;box.appendChild(v);box.classList.remove('hidden')}else box.classList.add('hidden')}
function bindEvents(newRoom,lib,epoch){
 newRoom.on(lib.RoomEvent.TrackSubscribed,track=>onTrack(track));
 newRoom.on(lib.RoomEvent.TrackUnsubscribed,track=>offTrack(track));
 newRoom.on(lib.RoomEvent.ParticipantDisconnected,()=>{const c=$('remote-video');if(c)c.textContent='Your friend left the call';});
 newRoom.on(lib.RoomEvent.Reconnecting,()=>{if(activeEpoch===epoch)status('Reconnecting call… the cards keep working')});
 newRoom.on(lib.RoomEvent.Reconnected,()=>{if(activeEpoch===epoch)status('Voice connected · your game continues')});
 newRoom.on(lib.RoomEvent.Disconnected,()=>{if(activeEpoch!==epoch)return;room=null;clearMedia();syncControls();status('Call disconnected · tap Join Voice to reconnect')});
 newRoom.on(lib.RoomEvent.AudioPlaybackStatusChanged,()=>{if(!newRoom.canPlayAudio)status('Tap Join Voice again if your browser blocked audio playback')});
}
export async function getCallAvailability(){
 try{const r=await fetch('/api/livekit-token',{cache:'no-store'});const j=await r.json();return Boolean(r.ok&&j.configured)}catch{return false}
}
export async function connectCall(getSession,showToast){
 if(busy||room)return;
 const session=getSession();if(!session||session.mode!=='remote'){showToast('VOICE & VIDEO ARE FOR REMOTE ROOMS');return}
 busy=true;status('Connecting private voice call…');syncControls();
 const epoch=++activeEpoch;let connecting=null;
 try{
  const response=await fetch('/api/livekit-token',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({code:session.code,token:session.token})});
  const body=await response.json().catch(()=>({error:'Invalid call server response'}));
  if(!response.ok)throw Error(body.error||'Calling is unavailable');
  sdk??=await import(SDK_URL);
  connecting=new sdk.Room({adaptiveStream:true,dynacast:true,stopLocalTrackOnUnpublish:true});
  bindEvents(connecting,sdk,epoch);
  await connecting.connect(body.url,body.token,{autoSubscribe:true});
  if(activeEpoch!==epoch){await connecting.disconnect();return}
  room=connecting;
  for(const p of room.remoteParticipants.values())for(const pub of p.trackPublications.values())if(pub.track)onTrack(pub.track);
  try{await room.localParticipant.setMicrophoneEnabled(true);status('Voice connected · camera off by default')}
  catch{status('Connected without mic · tap microphone to enable');showToast('MIC PERMISSION BLOCKED · CALL IS STILL CONNECTED')}
  syncControls();
 }catch(e){
  if(connecting){try{await connecting.disconnect()}catch{}}
  room=null;clearMedia();status(e.message||'Call could not connect');showToast(e.message||'CALL UNAVAILABLE — THE GAME STILL WORKS');syncControls();
 }finally{busy=false;syncControls()}
}
export async function toggleMicCall(showToast){
 if(!room||busy)return;busy=true;try{await room.localParticipant.setMicrophoneEnabled(!room.localParticipant.isMicrophoneEnabled);status(room.localParticipant.isMicrophoneEnabled?'Microphone on':'Microphone muted')}catch(e){showToast('MICROPHONE PERMISSION REQUIRED')}finally{busy=false;syncControls()}
}
export async function toggleCameraCall(showToast){
 if(!room||busy)return;busy=true;
 try{await room.localParticipant.setCameraEnabled(!room.localParticipant.isCameraEnabled,{facingMode:cameraFacing});refreshLocal();status(room.localParticipant.isCameraEnabled?'Camera enabled':'Camera off · voice remains connected')}
 catch{showToast('CAMERA PERMISSION DENIED · AUDIO STILL WORKS');status('Camera unavailable · voice still connected')}
 finally{busy=false;syncControls()}
}
export async function flipCameraCall(showToast){
 if(!room?.localParticipant?.isCameraEnabled||busy)return;
 busy=true;
 const next=cameraFacing==='user'?'environment':'user';
 try{
  // LiveKit LocalVideoTrack supports restartTrack to switch between camera facing modes.
  const track=room.localParticipant.videoTrackPublications.values().next().value?.track;
  if(!track?.restartTrack)throw Error('Camera switching not supported on this device');
  await track.restartTrack({facingMode:next});cameraFacing=next;refreshLocal();status('Camera switched');
 }catch{showToast('CAMERA SWITCHING UNAVAILABLE ON THIS DEVICE')}
 finally{busy=false;syncControls()}
}
export async function disconnectCall(){
 ++activeEpoch;const previous=room;room=null;busy=false;
 if(previous){try{await previous.disconnect()}catch{}}
 for(const el of document.querySelectorAll('#call-dock audio'))el.remove();
 clearMedia();status('Optional voice call · camera off by default');syncControls()
}
export function minimizeCall(){minimized=!minimized;syncControls()}
export function initCallControls(getSession,showToast){
 $('call-join').onclick=()=>connectCall(getSession,showToast);
 $('call-leave').onclick=()=>disconnectCall();
 $('call-mic').onclick=()=>toggleMicCall(showToast);
 $('call-camera').onclick=()=>toggleCameraCall(showToast);
 $('call-flip').onclick=()=>flipCameraCall(showToast);
 $('call-minimize').onclick=()=>minimizeCall();
 clearMedia();syncControls();
}
