/// <reference types="google.maps" />
import { useEffect, useId, useRef, useState } from 'react';
import { useOnline } from '@/pwa/useOnline';
import { authorizeMapOperation } from '@/features/operations/map-budget';
import { Icon } from '@/components/ui/Icon';
import { isPoint, TUNJA, type Point } from './discovery';
import {
  googleMapOptions,
  loadGoogleMaps,
  onGoogleMapsFailure,
} from './google-maps';
import { Notice, secondaryClass } from './Workspace';

export function SiteLocationPicker({
  latitude,
  longitude,
  index,
  disabled,
  onChange,
}: {
  latitude: number;
  longitude: number;
  index: number;
  disabled: boolean;
  onChange: (point: Point) => void;
}) {
  const online = useOnline();
  const [open, setOpen] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const id = useId();
  return (
    <div className="space-y-3 rounded-xl border border-brand-100 p-3">
      <button
        type="button"
        className={secondaryClass}
        disabled={disabled}
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((value) => !value)}
      >
        <Icon name="pin" />
        {open ? 'Cerrar selector del mapa' : 'Elegir ubicación en el mapa'}
      </button>
      {open && (
        <div id={id} className="space-y-3">
          <p className="text-sm">
            Toca el lugar de la sede o arrastra el marcador. También puedes
            mover el mapa y usar su centro. La dirección escrita se conserva;
            comprueba que corresponda al punto elegido.
          </p>
          {online ? (
            <SiteMap
              key={attempt}
              latitude={latitude}
              longitude={longitude}
              index={index}
              disabled={disabled}
              onChange={onChange}
              onRetry={() => setAttempt((value) => value + 1)}
            />
          ) : (
            <Notice>
              El mapa necesita conexión. Puedes escribir las coordenadas
              manualmente sin perder los datos del formulario.
            </Notice>
          )}
        </div>
      )}
    </div>
  );
}

function SiteMap({
  latitude,
  longitude,
  index,
  disabled,
  onChange,
  onRetry,
}: {
  latitude: number;
  longitude: number;
  index: number;
  disabled: boolean;
  onChange: (point: Point) => void;
  onRetry: () => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const marker = useRef<google.maps.marker.AdvancedMarkerElement | null>(null);
  const current = useRef({ latitude, longitude, disabled, onChange });
  const failed = useRef(false);
  const [map, setMap] = useState<google.maps.Map | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(false);
  useEffect(() => {
    current.current = { latitude, longitude, disabled, onChange };
  }, [latitude, longitude, disabled, onChange]);

  useEffect(() => {
    const host = container.current;
    let disposed = false;
    let instance: google.maps.Map | undefined;
    let pin: google.maps.marker.AdvancedMarkerElement | undefined;
    let timeout: number | undefined;
    const listeners: google.maps.MapsEventListener[] = [];
    const choose = (point: Point) => {
      if (
        disposed ||
        failed.current ||
        current.current.disabled ||
        !isPoint(point)
      )
        return;
      current.current.onChange({
        latitude: Number(point.latitude.toFixed(6)),
        longitude: Number(point.longitude.toFixed(6)),
      });
    };
    const onDrag = () => {
      const position = pin?.position;
      if (position)
        choose({
          latitude:
            typeof position.lat === 'function' ? position.lat() : position.lat,
          longitude:
            typeof position.lng === 'function' ? position.lng() : position.lng,
        });
    };
    const fail = () => {
      if (disposed) return;
      failed.current = true;
      if (pin) pin.gmpDraggable = false;
      setError(true);
      setReady(false);
      if (timeout) window.clearTimeout(timeout);
    };
    const unsubscribe = onGoogleMapsFailure(fail);
    void (async () => {
      try {
        await authorizeMapOperation('map');
        if (disposed) return;
        await loadGoogleMaps();
        const [maps, markers] = await Promise.all([
          google.maps.importLibrary('maps') as Promise<google.maps.MapsLibrary>,
          google.maps.importLibrary(
            'marker',
          ) as Promise<google.maps.MarkerLibrary>,
        ]);
        if (disposed || failed.current || !host) return;
        const initial = {
          latitude: current.current.latitude,
          longitude: current.current.longitude,
        };
        const valid = isPoint(initial);
        instance = new maps.Map(host, {
          ...googleMapOptions(),
          ...(valid
            ? {
                center: { lat: initial.latitude, lng: initial.longitude },
                zoom: 17,
              }
            : {}),
        });
        pin = new markers.AdvancedMarkerElement({
          map: valid ? instance : null,
          position: valid
            ? { lat: initial.latitude, lng: initial.longitude }
            : undefined,
          title: 'Ubicación de la sede',
          gmpDraggable: !current.current.disabled,
        });
        marker.current = pin;
        listeners.push(
          instance.addListener('click', (event: google.maps.MapMouseEvent) => {
            if (event.latLng)
              choose({
                latitude: event.latLng.lat(),
                longitude: event.latLng.lng(),
              });
          }),
        );
        // El canal quarterly conserva dragend; versiones nuevas usan gmp-dragend.
        listeners.push(pin.addListener('dragend', onDrag));
        pin.addEventListener('gmp-dragend', onDrag);
        listeners.push(
          instance.addListener('tilesloaded', () => {
            if (disposed || failed.current) return;
            if (timeout) window.clearTimeout(timeout);
            setReady(true);
          }),
        );
        timeout = window.setTimeout(fail, 20_000);
        setMap(instance);
      } catch {
        fail();
      }
    })();
    return () => {
      disposed = true;
      unsubscribe();
      if (timeout) window.clearTimeout(timeout);
      listeners.forEach((listener) => listener.remove());
      if (pin) {
        pin.removeEventListener('gmp-dragend', onDrag);
        pin.map = null;
      }
      marker.current = null;
      host?.replaceChildren();
    };
  }, []);

  useEffect(() => {
    const pin = marker.current;
    if (!map || !pin) return;
    pin.gmpDraggable = !disabled && !failed.current;
    pin.title = `Ubicación de la sede ${index + 1}`;
    const point = { latitude, longitude };
    if (!isPoint(point)) {
      pin.map = null;
      return;
    }
    const position = { lat: latitude, lng: longitude };
    pin.position = position;
    pin.map = map;
    map.panTo(position);
  }, [map, latitude, longitude, disabled, index]);

  return (
    <div className="space-y-3">
      {!ready && !error && <Notice>Cargando mapa de la sede…</Notice>}
      <div
        ref={container}
        role="region"
        aria-label={`Mapa para ubicar la sede ${index + 1}`}
        className="h-80 w-full overflow-hidden rounded-xl border border-brand-100"
        hidden={error}
        inert={disabled}
      />
      {error ? (
        <Notice error>
          Google Maps no está disponible. Reintenta o completa latitud y
          longitud manualmente.{' '}
          <button
            type="button"
            className={secondaryClass}
            disabled={disabled}
            onClick={onRetry}
          >
            Reintentar mapa de la sede
          </button>
        </Notice>
      ) : (
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            className={secondaryClass}
            disabled={!ready || disabled}
            onClick={() => {
              const center = map?.getCenter();
              if (center && !failed.current)
                onChange({
                  latitude: Number(center.lat().toFixed(6)),
                  longitude: Number(center.lng().toFixed(6)),
                });
            }}
          >
            Usar centro del mapa
          </button>
          <button
            type="button"
            className={secondaryClass}
            disabled={!ready || disabled}
            onClick={() => {
              map?.panTo({ lat: TUNJA.latitude, lng: TUNJA.longitude });
              map?.setZoom(13);
            }}
          >
            Centrar en Tunja
          </button>
        </div>
      )}
      <p className="text-xs text-stone-600">
        {isPoint({ latitude, longitude })
          ? `Punto elegido: ${latitude.toFixed(6)}, ${longitude.toFixed(6)}. Confirma debajo que corresponde a la dirección.`
          : 'Tunja es la referencia inicial del mapa. Todavía debes elegir el punto exacto de la sede.'}
      </p>
    </div>
  );
}
