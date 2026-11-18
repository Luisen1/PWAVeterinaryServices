import { useEffect, useRef, useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { voiceTime } from './voice-time';

export function VoiceWaveform({
  peaks = [],
  progress = 0,
}: {
  peaks?: number[];
  progress?: number;
}) {
  return (
    <svg
      className="voice-note-wave"
      viewBox="0 0 240 36"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      {Array.from({ length: 40 }, (_, index) => {
        const height = 4 + (peaks[index] ?? 0) * 30;
        return (
          <rect
            key={index}
            x={index * 6 + 1}
            y={(36 - height) / 2}
            width="3"
            height={height}
            rx="1.5"
            className={index / 40 < progress ? 'voice-note-wave--played' : ''}
          />
        );
      })}
    </svg>
  );
}

// Decode locally at a low sample rate; never upload the waveform or request the microphone.
// A codec that plays but cannot be decoded still has a usable seek control.
async function analyseVoice(file: Blob) {
  const context = new OfflineAudioContext(1, 1, 8000);
  const buffer = await context.decodeAudioData(await file.arrayBuffer());
  const channel = buffer.getChannelData(0);
  const peaks = Array.from({ length: 40 }, (_, index) => {
    const start = Math.floor((index * channel.length) / 40);
    const end = Math.floor(((index + 1) * channel.length) / 40);
    let sum = 0;
    for (let sample = start; sample < end; sample++)
      sum += (channel[sample] ?? 0) ** 2;
    return Math.sqrt(sum / Math.max(1, end - start));
  });
  const maximum = Math.max(...peaks, 0.001);
  return {
    peaks: peaks.map((peak) => peak / maximum),
    duration: buffer.duration,
  };
}

export function VoiceNotePlayer({
  file,
  mime,
  received,
  durationMs,
}: {
  file: Blob;
  mime?: string;
  received: boolean;
  durationMs?: number;
}) {
  const audio = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [peaks, setPeaks] = useState<number[]>([]);
  const [error, setError] = useState(false);
  const total = duration || (durationMs ?? 0) / 1000;
  const progress = total ? Math.min(1, current / total) : 0;

  useEffect(() => {
    const element = audio.current;
    if (!element) return;
    let active = true;
    const source =
      mime && file.type !== mime ? new Blob([file], { type: mime }) : file;
    const url = URL.createObjectURL(source);
    element.src = url;
    void analyseVoice(source)
      .then((result) => {
        if (active) {
          setPeaks(result.peaks);
          setDuration(
            Number.isFinite(element.duration) && element.duration > 0
              ? element.duration
              : result.duration,
          );
        }
      })
      .catch(() => {
        /* Playback does not depend on waveform decoding. */
      });
    return () => {
      active = false;
      element.pause();
      element.removeAttribute('src');
      element.load();
      URL.revokeObjectURL(url);
    };
  }, [file, mime]);

  async function toggle() {
    const element = audio.current;
    if (!element) return;
    if (!element.paused) {
      element.pause();
      return;
    }
    setError(false);
    try {
      if (element.error) element.load();
      if (element.ended) element.currentTime = 0;
      await element.play();
    } catch (reason) {
      if (!(reason instanceof DOMException && reason.name === 'AbortError'))
        setError(true);
    }
  }

  return (
    <div
      className="voice-note"
      role="group"
      aria-label={
        received ? 'Nota de voz del chat' : 'Vista previa de nota de voz'
      }
    >
      <audio
        ref={audio}
        hidden
        data-voice-note
        preload="metadata"
        onEmptied={() => {
          setPlaying(false);
          setCurrent(0);
          setDuration(0);
          setPeaks([]);
          setError(false);
        }}
        aria-label={
          received
            ? 'Reproducir nota de voz recibida'
            : 'Escuchar nota de voz antes de enviar'
        }
        onPlay={() => {
          // Listen to one note at a time, including previews in the composer.
          document
            .querySelectorAll<HTMLAudioElement>('audio[data-voice-note]')
            .forEach((other) => {
              if (other !== audio.current) other.pause();
            });
          setPlaying(true);
        }}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        onTimeUpdate={(event) => setCurrent(event.currentTarget.currentTime)}
        onDurationChange={(event) => {
          const value = event.currentTarget.duration;
          if (Number.isFinite(value) && value > 0) setDuration(value);
        }}
        onError={() => setError(true)}
      />
      <button
        type="button"
        className="voice-note-toggle"
        onClick={() => void toggle()}
        aria-label={playing ? 'Pausar nota de voz' : 'Reproducir nota de voz'}
        title={playing ? 'Pausar nota de voz' : 'Reproducir nota de voz'}
      >
        <Icon name={playing ? 'pause' : 'play'} />
      </button>
      <div className="voice-note-track">
        <div className="voice-note-seek">
          <VoiceWaveform peaks={peaks} progress={progress} />
          <input
            type="range"
            min="0"
            max={total || 1}
            step="0.01"
            value={Math.min(current, total || 1)}
            disabled={!total}
            aria-label="Posición de la nota de voz"
            aria-valuetext={`${voiceTime(current)} de ${voiceTime(total)}`}
            onChange={(event) => {
              const value = Number(event.target.value);
              if (audio.current) audio.current.currentTime = value;
              setCurrent(value);
            }}
          />
        </div>
        <div className="voice-note-times">
          <span>{voiceTime(current > 0 ? current : total)}</span>
          <span className="sr-only">
            {current > 0 ? ` de ${voiceTime(total)}` : ' de duración'}
          </span>
        </div>
      </div>
      <span className="voice-note-microphone" aria-hidden="true">
        <Icon name="microphone" />
      </span>
      {error && (
        <p className="voice-note-error" role="alert">
          No pudimos reproducir el audio. Pulsa reproducir para reintentar.
        </p>
      )}
    </div>
  );
}
