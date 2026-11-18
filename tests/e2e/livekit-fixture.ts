import type { BrowserContext } from '@playwright/test';

// Controlled SDK transport with actual browser MediaStreamTracks. Never loaded by production.
export async function mockLivekitTransport(context: BrowserContext) {
  await context.route('**/livekit-client.esm-*.js', (route) =>
    route.fulfill({
      contentType: 'text/javascript',
      body: String.raw`
export const ConnectionState = { Connected:'connected' };
export const RoomEvent = Object.fromEntries(['TrackSubscribed','TrackUnsubscribed','LocalTrackPublished','TrackMuted','TrackUnmuted','MediaDevicesChanged','Reconnecting','SignalReconnecting','Reconnected','Disconnected'].map(k=>[k,k]));
const debug = window.callTransport = { tracks:[], rooms:[], switches:[], rejectDevice:false, cameraDenied:false, reconnect:null, recover:null, disconnect:null };
async function capture(kind, options) {
  if (kind==='video' && debug.cameraDenied) throw new DOMException('Camera denied','NotAllowedError');
  const stream = await navigator.mediaDevices.getUserMedia(kind==='audio' ? {audio:options,video:false} : {audio:false,video:options});
  const native = stream.getTracks()[0]; debug.tracks.push(native);
  const track = { kind, mediaStreamTrack:native, attachedElements:[],
    attach(){ const element=document.createElement(kind); element.srcObject=stream; element.autoplay=true; element.muted=true; this.attachedElements.push(element); return element; },
    detach(){ const elements=this.attachedElements; this.attachedElements=[]; return elements; },
    stop(){ native.stop(); }
  }; return track;
}
export const createLocalAudioTrack = options => capture('audio',options);
export const createLocalVideoTrack = options => capture('video',options);
export class Room {
  constructor(options){
    this.options=options; this.state='connecting'; this.listeners=new Map(); this.ids={audioinput:'',videoinput:''};
    debug.rooms.push(this);
    debug.reconnect=()=>{this.state='reconnecting'; this.emit('Reconnecting');};
    debug.recover=()=>{this.state='connected'; this.emit('Reconnected');};
    debug.disconnect=()=>{this.state='disconnected'; this.emit('Disconnected');};
    this.localParticipant={trackPublications:new Map(),isMicrophoneEnabled:false,isCameraEnabled:false,
      publishTrack: async track=>{ this.localParticipant.trackPublications.set(track.kind,{track}); this.localParticipant[track.kind==='video'?'isCameraEnabled':'isMicrophoneEnabled']=true; this.emit('LocalTrackPublished',{track}); },
      setMicrophoneEnabled: async enabled=>{ const publication=this.localParticipant.trackPublications.get('audio'); if(publication) publication.track.mediaStreamTrack.enabled=enabled; this.localParticipant.isMicrophoneEnabled=enabled; this.emit(enabled?'TrackUnmuted':'TrackMuted'); return publication; },
      setCameraEnabled: async enabled=>{
        if(enabled) { const track=await capture('video',{width:640,height:360,frameRate:15}); await this.localParticipant.publishTrack(track); }
        else { const publication=this.localParticipant.trackPublications.get('video'); if(publication) publication.track.stop(); this.localParticipant.isCameraEnabled=false; this.emit('TrackMuted'); }
        return this.localParticipant.trackPublications.get('video');
      }
    };
  }
  on(event,callback){const list=this.listeners.get(event)||[]; list.push(callback); this.listeners.set(event,list); return this;}
  emit(event,...args){(this.listeners.get(event)||[]).forEach(callback=>callback(...args));}
  removeAllListeners(){this.listeners.clear();}
  async connect(url,token){this.state='connected'; this.url=url; this.token=token;}
  async disconnect(){this.state='disconnected';}
  async startAudio(){}
  getActiveDevice(kind){return this.ids[kind];}
  async switchActiveDevice(kind,id){ if(debug.rejectDevice) return false; this.ids[kind]=id; debug.switches.push({kind,id}); return true; }
}
`,
    }),
  );
}

export interface CallTransportProbe {
  tracks: MediaStreamTrack[];
  rooms: { state: string }[];
  switches: { kind: string; id: string }[];
  rejectDevice: boolean;
  cameraDenied: boolean;
  reconnect: () => void;
  recover: () => void;
  disconnect: () => void;
}
