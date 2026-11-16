/// <reference types="google.maps" />
import { useEffect, useRef, useState } from 'react';
import type { RouteEstimate } from './google-routes';
import { Notice } from './Workspace';

export default function GoogleRouteMap({ route }: { route: RouteEstimate }) {
  const container = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let disposed = false;
    let line: google.maps.Polyline | undefined;
    let map: google.maps.Map | undefined;
    const circles: google.maps.Circle[] = [];
    void (async () => {
      try {
        const library = (await google.maps.importLibrary(
          'maps',
        )) as google.maps.MapsLibrary;
        if (disposed || !container.current) return;
        map = new library.Map(container.current, {
          center: route.path[0],
          zoom: 14,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
          gestureHandling: 'cooperative',
        });
        line = new library.Polyline({
          path: route.path,
          map,
          strokeColor: '#0b1f4b',
          strokeOpacity: 0.9,
          strokeWeight: 5,
        });
        const bounds = new google.maps.LatLngBounds();
        route.path.forEach((point) => bounds.extend(point));
        map.fitBounds(bounds, 40);
        for (const [index, center] of [
          route.path[0]!,
          route.path.at(-1)!,
        ].entries())
          circles.push(
            new library.Circle({
              center,
              radius: 10,
              strokeColor: '#ffffff',
              strokeWeight: 2,
              fillColor: index === 0 ? '#2455ae' : '#15a34a',
              fillOpacity: 1,
              map,
            }),
          );
      } catch {
        if (!disposed) setFailed(true);
      }
    })();
    return () => {
      disposed = true;
      line?.setMap(null);
      circles.forEach((circle) => circle.setMap(null));
      if (map) google.maps.event.clearInstanceListeners(map);
    };
  }, [route]);
  return (
    <div className="space-y-2">
      <div
        ref={container}
        className="directory-map"
        role="region"
        aria-label="Ruta calculada en Google Maps"
      />
      {failed && (
        <Notice error>
          No pudimos dibujar el trazado. Abre las indicaciones externas para
          consultar el recorrido.
        </Notice>
      )}
      <p className="text-xs">
        Azul: salida · Verde: llegada. Trazado y estimación proporcionados por
        Google Maps.
      </p>
    </div>
  );
}
