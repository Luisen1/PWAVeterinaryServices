import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet.markercluster';
import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';
import { categoryPins, type MapSite } from './map-model';
import { TUNJA, type Origin, type Point } from './discovery';

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
}) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const clusterRef = useRef<L.MarkerClusterGroup | null>(null);
  const markersRef = useRef(new Map<string, L.Marker>());
  const selectRef = useRef(onSelect);
  const failureRef = useRef(onFailure);
  const pickRef = useRef({ picking, onPick });
  const originLayer = useRef<L.LayerGroup | null>(null);
  useEffect(() => {
    selectRef.current = onSelect;
    failureRef.current = onFailure;
    pickRef.current = { picking, onPick };
  }, [onSelect, onFailure, picking, onPick]);
  useEffect(() => {
    if (!container.current) return;
    const reducedMotion = window.matchMedia(
      '(prefers-reduced-motion: reduce)',
    ).matches;
    const map = L.map(container.current, {
      scrollWheelZoom: false,
      maxZoom: 19,
      zoomAnimation: !reducedMotion,
    }).setView([TUNJA.latitude, TUNJA.longitude], 13);
    mapRef.current = map;
    const clusters = L.markerClusterGroup({
      maxClusterRadius: 55,
      showCoverageOnHover: false,
      spiderfyOnMaxZoom: true,
      animate: !reducedMotion,
    });
    clusterRef.current = clusters;
    map.addLayer(clusters);
    originLayer.current = L.layerGroup().addTo(map);
    map.on('click', (event: L.LeafletMouseEvent) => {
      if (pickRef.current.picking)
        pickRef.current.onPick?.({
          latitude: event.latlng.lat,
          longitude: event.latlng.lng,
        });
    });
    const tiles = L.tileLayer(
      import.meta.env.VITE_MAP_TILE_URL ||
        'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
      {
        maxZoom: 19,
        attribution:
          import.meta.env.VITE_MAP_ATTRIBUTION ||
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      },
    );
    let loaded = false;
    let failures = 0;
    const timeout = window.setTimeout(() => {
      if (!loaded) failureRef.current();
    }, 12000);
    tiles.on('tileload', () => {
      loaded = true;
      window.clearTimeout(timeout);
    });
    tiles.on('tileerror', () => {
      failures++;
      if (failures === 3) failureRef.current();
    });
    tiles.addTo(map);
    const observer = new ResizeObserver(() => map.invalidateSize());
    observer.observe(container.current);
    return () => {
      window.clearTimeout(timeout);
      observer.disconnect();
      map.remove();
      mapRef.current = null;
      clusterRef.current = null;
    };
  }, []);
  useEffect(() => {
    const clusters = clusterRef.current;
    const map = mapRef.current;
    if (!clusters || !map) return;
    clusters.clearLayers();
    markersRef.current.clear();
    for (const row of sites) {
      const pin =
        categoryPins[row.establishment.document.category] ?? categoryPins.Otro;
      const marker = L.marker([row.site.latitude, row.site.longitude], {
        title: `${row.establishment.document.name} · ${row.site.name}`,
        alt: `${row.establishment.document.category}: ${row.establishment.document.name}, ${row.site.name}`,
        icon: L.divIcon({
          className: 'category-map-pin',
          html: `<span style="background:${pin.color}"><b>${pin.symbol}</b></span>`,
          iconSize: [34, 42],
          iconAnchor: [17, 42],
        }),
      });
      const label = document.createElement('span');
      label.textContent = `${row.establishment.document.name} · ${row.site.name}`;
      marker.bindTooltip(label);
      marker.on('click', () => {
        if (pickRef.current.picking)
          pickRef.current.onPick?.({
            latitude: row.site.latitude,
            longitude: row.site.longitude,
          });
        else selectRef.current(row.key);
      });
      markersRef.current.set(row.key, marker);
      clusters.addLayer(marker);
    }
    if (fitSites && sites.length)
      map.fitBounds(
        L.latLngBounds(sites.map((r) => [r.site.latitude, r.site.longitude])),
        { padding: [35, 35], maxZoom: 14 },
      );
  }, [sites, fitSites]);
  useEffect(() => {
    const layer = originLayer.current;
    const map = mapRef.current;
    if (!layer || !map) return;
    layer.clearLayers();
    if (!origin) return;
    const position: L.LatLngTuple = [origin.latitude, origin.longitude];
    if (origin.accuracy !== null)
      L.circle(position, {
        radius: origin.accuracy,
        color: '#2455ae',
        fillOpacity: 0.08,
        weight: 1,
      }).addTo(layer);
    L.circleMarker(position, {
      radius: 8,
      color: '#fff',
      weight: 3,
      fillColor: '#2455ae',
      fillOpacity: 1,
    })
      .bindTooltip(origin.label)
      .addTo(layer);
    if (fitSites && sites.length)
      map.fitBounds(
        L.latLngBounds([
          position,
          ...sites.map((s): L.LatLngTuple => [
            s.site.latitude,
            s.site.longitude,
          ]),
        ]),
        { paddingTopLeft: [55, 65], paddingBottomRight: [55, 55], maxZoom: 15 },
      );
    else map.panTo(position);
  }, [origin, sites, fitSites]);
  useEffect(() => {
    if (!active) return;
    mapRef.current?.invalidateSize({ pan: false });
    if (!selection) return;
    const marker = markersRef.current.get(selection);
    if (marker)
      clusterRef.current?.zoomToShowLayer(marker, () => marker.openTooltip());
  }, [selection, sites, active]);
  return (
    <div
      ref={container}
      className="directory-map"
      data-picking={picking}
      role="region"
      aria-label="Mapa interactivo de sedes aprobadas"
    />
  );
}
