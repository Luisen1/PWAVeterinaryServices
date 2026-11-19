import { useState, type FormEvent } from 'react';
import {
  chooseOrigin,
  chooseTunja,
  requestLocation,
  useOrigin,
} from './origin-store';
import { isPoint } from './discovery';
import { Icon } from '@/components/ui/Icon';
import { Notice, secondaryClass } from './Workspace';

export function OriginPicker({
  picking,
  onPick,
  compact = false,
}: {
  picking: boolean;
  onPick: () => void;
  compact?: boolean;
}) {
  const { origin, pending, error } = useOrigin();
  const [expanded, setExpanded] = useState(false);
  const [latitude, setLatitude] = useState('');
  const [longitude, setLongitude] = useState('');
  const [manualError, setManualError] = useState('');
  function submit(event: FormEvent) {
    event.preventDefault();
    const point = { latitude: Number(latitude), longitude: Number(longitude) };
    if (!latitude.trim() || !longitude.trim() || !isPoint(point)) {
      setManualError('Indica coordenadas válidas para tu punto de partida.');
      return;
    }
    setManualError('');
    chooseOrigin({
      ...point,
      label: 'Mi punto de partida',
      source: 'manual',
      accuracy: null,
    });
    if (compact) setExpanded(false);
  }
  return (
    <section
      className={`origin-panel ${compact ? 'origin-panel--compact' : ''}`}
      aria-label="Punto de partida"
    >
      <div className="origin-panel__heading">
        <span className="location-badge">
          <Icon name="pin" />
          Tunja, Boyacá
        </span>
        {compact && (
          <div className="origin-quick-actions">
            <button
              className={secondaryClass}
              disabled={pending}
              onClick={requestLocation}
              aria-label={pending ? 'Obteniendo ubicación…' : 'Mi ubicación'}
              title="Mi ubicación"
            >
              <Icon name="compass" />
            </button>
            <button
              className={secondaryClass}
              aria-pressed={picking}
              onClick={onPick}
              aria-label={
                picking ? 'Cancelar selección' : 'Marcar mi casa en el mapa'
              }
              title={
                picking ? 'Cancelar selección' : 'Marcar mi casa en el mapa'
              }
            >
              <Icon name="pin" />
            </button>
          </div>
        )}
        <button
          className={
            compact
              ? `${secondaryClass} origin-settings`
              : 'text-sm font-semibold text-brand-700 underline'
          }
          aria-label="Cambiar punto de partida"
          title="Cambiar punto de partida"
          aria-expanded={expanded}
          onClick={() => setExpanded((v) => !v)}
        >
          {compact ? <Icon name="settings" /> : 'Cambiar punto de partida'}
        </button>
      </div>
      {(origin || expanded || !compact) && (
        <p className="text-sm">
          {origin
            ? `${origin.label} · ${origin.latitude.toFixed(5)}, ${origin.longitude.toFixed(5)}`
            : 'Elige tu ubicación o marca desde dónde vas a salir.'}
        </p>
      )}
      {origin?.accuracy !== null && origin?.accuracy !== undefined && (
        <p className="text-xs">
          Precisión aproximada: {Math.round(origin.accuracy)} m.
        </p>
      )}
      {!compact && (
        <div className="flex flex-wrap gap-2">
          <button
            className={secondaryClass}
            disabled={pending}
            onClick={requestLocation}
          >
            <Icon name="compass" />
            {pending ? 'Obteniendo ubicación…' : 'Mi ubicación'}
          </button>
          <button
            className={secondaryClass}
            aria-pressed={picking}
            onClick={onPick}
          >
            <Icon name="pin" />
            {picking ? 'Cancelar selección' : 'Marcar mi casa en el mapa'}
          </button>
        </div>
      )}
      {pending && (
        <Notice>
          Buscando tu posición. También puedes marcar un punto sin esperar.
        </Notice>
      )}
      {error && (
        <Notice error>
          {error}{' '}
          <button
            className="font-semibold underline"
            onClick={() => setExpanded(true)}
          >
            Introducir origen manual
          </button>
        </Notice>
      )}
      {picking && (
        <Notice>
          Toca un punto del mapa para elegir tu casa o tu lugar de salida.
        </Notice>
      )}
      {expanded && (
        <div className="origin-panel__manual">
          <p className="text-sm">
            Puedes usar Tunja como referencia de búsqueda o introducir el punto
            exacto de salida. El centro de la ciudad no representa tu casa.
          </p>
          <button className={secondaryClass} onClick={chooseTunja}>
            Usar centro de Tunja
          </button>
          <form className="space-y-3" onSubmit={submit}>
            <div className="origin-coordinate-fields">
              <label>
                Latitud de partida
                <input
                  className="sv-input"
                  inputMode="decimal"
                  type="number"
                  min={-90}
                  max={90}
                  step="any"
                  required
                  value={latitude}
                  onChange={(e) => setLatitude(e.target.value)}
                  placeholder="5.5353"
                />
              </label>
              <label>
                Longitud de partida
                <input
                  className="sv-input"
                  inputMode="decimal"
                  type="number"
                  min={-180}
                  max={180}
                  step="any"
                  required
                  value={longitude}
                  onChange={(e) => setLongitude(e.target.value)}
                  placeholder="-73.3678"
                />
              </label>
            </div>
            {manualError && <Notice error>{manualError}</Notice>}
            <button className={secondaryClass}>Usar estas coordenadas</button>
          </form>
        </div>
      )}
      {origin && (!compact || expanded) && (
        <button
          className="text-xs font-semibold text-brand-700 underline"
          onClick={() => chooseOrigin(null)}
        >
          Quitar punto de partida
        </button>
      )}
    </section>
  );
}
