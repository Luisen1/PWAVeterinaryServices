export type CallPhase = 'idle' | 'joining' | 'connected' | 'reconnecting';
export interface CallMediaState {
  microphone: boolean;
  camera: boolean;
  microphoneId: string;
  cameraId: string;
}
export interface CallOptions {
  audioOnly: boolean;
  microphoneId: string;
  cameraId: string;
}
export interface CallConnection {
  close: () => Promise<void>;
  startAudio: () => Promise<void>;
  microphone: (enabled: boolean) => Promise<void>;
  camera: (enabled: boolean) => Promise<void>;
  switchDevice: (
    kind: 'audioinput' | 'videoinput',
    id: string,
  ) => Promise<void>;
  interrupt: () => void;
  revalidate: () => Promise<void>;
}
