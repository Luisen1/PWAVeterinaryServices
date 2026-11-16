/// <reference types="google.maps" />
import { useEffect, useRef, useState } from 'react';
import {
  MarkerClusterer,
  SuperClusterAlgorithm,
  type Cluster,
} from '@googlemaps/markerclusterer';
import { categoryPins, type MapSite } from './map-model';
import { type Origin, type Point } from './discovery';
import {
  googleMapOptions,
  loadGoogleMaps,
  onGoogleMapsFailure,
  RouteFailure,
} from './google-maps';
import type { RouteEstimate } from './google-routes';
import { Notice } from './Workspace';

export default function MapCanvas({
  sites,
  selection,
  onSelect,
  onFailure,
  origin = null,
  picking = false,
  onPick,
  fitSites = false,
  active = true,
  route = null,
}: {
  sites: MapSite[];
  selection: string | null;
  onSelect: (key: string) => void;
  onFailure: () => void;
  origin?: Origin | null;
  picking?: boolean;
  onPick?: (point: Point) => void;
  fitSites?: boolean;
  active?: boolean;
  route?: RouteEstimate | null;
}) {
  const container = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<google.maps.Map | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const callbacks = useRef({ onSelect, onFailure, picking, onPick });
  useEffect(() => {
    callbacks.current = { onSelect, onFailure, picking, onPick };
  }, [onSelect, onFailure, picking, onPick]);

  useEffect(() => {
    let disposed = false;
    let instance: google.maps.Map | undefined;
    let timeout: number | undefined;
    const fail = () => {
      if (disposed) return;
      setLoading(false);
      callbacks.current.onFailure();
    };
    const unsubscribe = onGoogleMapsFailure(fail);
    void (async () => {
      try {
        await loadGoogleMaps();
        const [library] = await Promise.all([
          google.maps.importLibrary('maps') as Promise<google.maps.MapsLibrary>,
          google.maps.importLibrary('marker'),
        ]);
        if (disposed || !container.current) return;
        instance = new library.Map(container.current, googleMapOptions());
        instance.addListener('click', (event: google.maps.MapMouseEvent) => {
          if (callbacks.current.picking && event.latLng)
            callbacks.current.onPick?.({
              latitude: event.latLng.lat(),
              longitude: event.latLng.lng(),
            });
        });
        instance.addListener('tilesloaded', () => {
          if (disposed) return;
          window.clearTimeout(timeout);
          setLoading(false);
        });
        timeout = window.setTimeout(fail, 15000);
        setMap(instance);
      } catch (failure) {
        if (!disposed) {
          setError(
            failure instanceof RouteFailure
              ? failure.message
              : 'No pudimos iniciar Google Maps. Consulta el listado o las indicaciones externas.',
          );
          fail();
        }
      }
    })();
    return () => {
      disposed = true;
      unsubscribe();
      window.clearTimeout(timeout);
      if (instance) google.maps.event.clearInstanceListeners(instance);
    };
  }, []);

  useEffect(() => {
    if (!map) return;
    const { AdvancedMarkerElement } = google.maps.marker;
    const info = new google.maps.InfoWindow();
    const markers = sites.map((row) => {
      const pin =
        categoryPins[row.establishment.document.category] ?? categoryPins.Otro;
      const content = document.createElement('div');
      content.className = 'category-map-pin';
      content.innerHTML = '<span><b></b></span>';
      content.firstElementChild!.setAttribute(
        'style',
        `background:${pin.color}`,
      );
      content.querySelector('b')!.textContent = pin.symbol;
      const marker = new AdvancedMarkerElement({
        position: { lat: row.site.latitude, lng: row.site.longitude },
        title: `${row.establishment.document.name} · ${row.site.name}`,
        content,
        gmpClickable: true,
      });
      marker.addEventListener('gmp-click', () => {
        if (callbacks.current.picking)
          callbacks.current.onPick?.({
            latitude: row.site.latitude,
            longitude: row.site.longitude,
          });
        else callbacks.current.onSelect(row.key);
      });
      return marker;
    });
    const openCluster = (cluster: Cluster) => {
      const bounds = cluster.bounds;
      if (!bounds) return;
      const northEast = bounds.getNorthEast();
      const southWest = bounds.getSouthWest();
      // El centro calculado por la agrupación puede redondear las coordenadas.
      const coincident =
        Math.abs(northEast.lat() - southWest.lat()) < 0.00001 &&
        Math.abs(northEast.lng() - southWest.lng()) < 0.00001;
      if (!coincident && (map.getZoom() ?? 13) < 19) {
        map.fitBounds(bounds, 60);
        return;
      }
      const list = document.createElement('div');
      list.className = 'map-cluster-choices';
      for (const marker of cluster.markers) {
        const index = markers.indexOf(
          marker as google.maps.marker.AdvancedMarkerElement,
        );
        const row = sites[index];
        if (!row) continue;
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = `${row.establishment.document.name} · ${row.site.name}`;
        button.addEventListener('click', () => {
          if (callbacks.current.picking)
            callbacks.current.onPick?.({
              latitude: row.site.latitude,
              longitude: row.site.longitude,
            });
          else callbacks.current.onSelect(row.key);
          info.close();
        });
        list.append(button);
      }
      info.setContent(list);
      info.setPosition(cluster.position);
      info.open({ map });
    };
    const clusterer = new MarkerClusterer({
      map,
      markers,
      algorithm: new SuperClusterAlgorithm({ radius: 55, maxZoom: 20 }),
      renderer: {
        render: (cluster) => {
          const content = document.createElement('div');
          content.className = 'map-cluster';
          content.textContent = String(cluster.count);
          const marker = new AdvancedMarkerElement({
            position: cluster.position,
            content,
            gmpClickable: true,
            title: `Ver ${cluster.count} sedes cercanas`,
          });
          marker.addEventListener('gmp-click', () => openCluster(cluster));
          return marker;
        },
      },
      // La activación accesible usa el evento DOM gmp-click del marcador.
      onClusterClick: () => undefined,
    });
    return () => {
      info.close();
      clusterer.setMap(null);
      markers.forEach((marker) => {
        marker.map = null;
        google.maps.event.clearInstanceListeners(marker);
      });
    };
  }, [map, sites]);

  useEffect(() => {
    if (!map) return;
    const circles: google.maps.Circle[] = [];
    if (origin) {
      const center = { lat: origin.latitude, lng: origin.longitude };
      if (origin.accuracy !== null)
        circles.push(
          new google.maps.Circle({
            map,
            center,
            radius: origin.accuracy,
            strokeColor: '#2455ae',
            fillColor: '#2455ae',
            fillOpacity: 0.08,
            strokeWeight: 1,
            clickable: false,
          }),
        );
      circles.push(
        new google.maps.Circle({
          map,
          center,
          radius: 10,
          strokeColor: '#ffffff',
          fillColor: '#2455ae',
          fillOpacity: 1,
          strokeWeight: 3,
          clickable: false,
        }),
      );
    }
    return () => circles.forEach((circle) => circle.setMap(null));
  }, [map, origin]);

  useEffect(() => {
    if (!map || route) return;
    if (fitSites && sites.length) {
      const bounds = new google.maps.LatLngBounds();
      sites.forEach((s) =>
        bounds.extend({ lat: s.site.latitude, lng: s.site.longitude }),
      );
      if (origin)
        bounds.extend({ lat: origin.latitude, lng: origin.longitude });
      map.fitBounds(bounds, 55);
    } else if (origin)
      map.panTo({ lat: origin.latitude, lng: origin.longitude });
  }, [map, sites, fitSites, origin, route]);

  useEffect(() => {
    if (!map || !active) return;
    google.maps.event.trigger(map, 'resize');
    const row = sites.find((s) => s.key === selection);
    if (!row) return;
    const position = { lat: row.site.latitude, lng: row.site.longitude };
    map.panTo(position);
    const content = document.createElement('span');
    content.textContent = `${row.establishment.document.name} · ${row.site.name}`;
    const info = new google.maps.InfoWindow({ content, position });
    info.open({ map, shouldFocus: false });
    return () => info.close();
  }, [map, selection, sites, active]);

  useEffect(() => {
    if (!map) return;
    map.setOptions({ draggableCursor: picking ? 'crosshair' : null });
  }, [map, picking]);

  useEffect(() => {
    if (!map || !route) return;
    const line = new google.maps.Polyline({
      path: route.path,
      map,
      strokeColor: '#0b1f4b',
      strokeOpacity: 0.9,
      strokeWeight: 5,
    });
    const bounds = new google.maps.LatLngBounds();
    route.path.forEach((point) => bounds.extend(point));
    map.fitBounds(bounds, 40);
    return () => line.setMap(null);
  }, [map, route]);

  return (
    <div className="space-y-2">
      <div
        ref={container}
        className="directory-map"
        data-picking={picking}
        role="region"
        aria-label={
          route
            ? 'Ruta calculada en Google Maps'
            : 'Mapa interactivo de sedes aprobadas'
        }
      />
      {loading && (
        <p role="status" className="text-sm">
          Cargando Google Maps…
        </p>
      )}
      {error && <Notice error>{error}</Notice>}
      {route && (
        <p className="text-xs">
          Azul: salida · Pin: llegada. Trazado y estimación proporcionados por
          Google Maps.
        </p>
      )}
    </div>
  );
}
