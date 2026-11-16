import type { BrowserContext } from '@playwright/test';

export async function mockGoogleMaps(
  context: BrowserContext,
  options: {
    quota?: boolean;
    empty?: boolean;
    delayed?: boolean;
    failLoad?: boolean;
  } = {},
) {
  await context.route(
    'https://maps.googleapis.com/maps/api/js**',
    async (route) => {
      if (options.failLoad) {
        await route.abort('failed');
        return;
      }
      const callback = new URL(route.request().url()).searchParams.get(
        'callback',
      )!;
      await route.fulfill({
        contentType: 'text/javascript',
        body: `(() => {
      const options = ${JSON.stringify(options)};
      const listeners = new WeakMap();
      const event = {
        addListener(target, name, handler) {
          if (!listeners.has(target)) listeners.set(target, {});
          const events = listeners.get(target);
          (events[name] ??= new Set()).add(handler);
          return {remove: () => events[name].delete(handler)};
        },
        trigger(target, name, ...args) { listeners.get(target)?.[name]?.forEach(handler => handler(...args)); },
        removeListener(listener) { listener.remove(); },
        clearInstanceListeners(target) { listeners.delete(target); }
      };
      class LatLng {
        constructor(lat, lng) { this.y=typeof lat==='number'?lat:lat?.lat??0; this.x=typeof lat==='number'?lng:lat?.lng??0; }
        lat(){return this.y;} lng(){return this.x;}
        equals(other){return this.y===other.lat() && this.x===other.lng();}
      }
      const point = p => p instanceof LatLng ? p : new LatLng(p);
      class LatLngBounds {
        constructor(sw, ne){this.points=[]; if(sw)this.extend(sw); if(ne)this.extend(ne);}
        extend(p){this.points.push(point(p)); return this;}
        getNorthEast(){return new LatLng(Math.max(...this.points.map(p=>p.lat())),Math.max(...this.points.map(p=>p.lng())));}
        getSouthWest(){return new LatLng(Math.min(...this.points.map(p=>p.lat())),Math.min(...this.points.map(p=>p.lng())));}
        getCenter(){const a=this.getNorthEast(),b=this.getSouthWest();return new LatLng((a.lat()+b.lat())/2,(a.lng()+b.lng())/2);}
      }
      window.__routeCalls=[]; window.__routeDrawn=0; window.__mapsCreated=0;
      class Map {
        constructor(container, opts){
          this.container=container; this.zoom=opts.zoom; this.center=opts.center;
          container.dataset.mapInstance=String(++window.__mapsCreated);
          container.style.position='relative'; container.style.overflow='hidden';
          container.style.background='#e5f0e8';
          const attribution=document.createElement('span'); attribution.textContent='Google Maps (prueba controlada)';
          attribution.style.cssText='position:absolute;bottom:4px;left:8px;font-size:10px';container.append(attribution);
          this.pins=document.createElement('div');this.pins.style.cssText='display:flex;gap:10px;flex-wrap:wrap;padding:60px 20px';container.append(this.pins);
          for(const [label,delta] of [['Zoom in',1],['Zoom out',-1]]){
            const button=document.createElement('button');button.type='button';button.textContent=delta>0?'+':'−';button.setAttribute('aria-label',label);
            button.style.cssText='padding:8px;background:white;margin:4px';button.onclick=e=>{e.stopPropagation();this.setZoom(this.zoom+delta);};container.append(button);
          }
          container.addEventListener('click',()=>event.trigger(this,'click',{latLng:new LatLng(this.center)}));
          setTimeout(()=>{event.trigger(this,'tilesloaded');event.trigger(this,'idle');},25);
        }
        addListener(name,handler){return event.addListener(this,name,handler);}
        fitBounds(bounds){this.center={lat:bounds.getCenter().lat(),lng:bounds.getCenter().lng()};this.setZoom(Math.min(19,this.zoom+2));}
        panTo(center){this.center=center;}
        getCenter(){return new LatLng(this.center);}
        getZoom(){return this.zoom;}
        setZoom(zoom){this.zoom=zoom;event.trigger(this,'idle');}
        getProjection(){return {};}
        getMapCapabilities(){return {isAdvancedMarkersAvailable:true};}
        setOptions(){}
      }
      function OverlayView(){}
      OverlayView.prototype.setMap=function(map){if(this._map)this.onRemove?.();this._map=map;if(map)this.onAdd?.();};
      OverlayView.prototype.getMap=function(){return this._map;};
      OverlayView.prototype.getProjection=function(){return {};};
      class AdvancedMarkerElement extends HTMLElement {
        constructor(opts={}){
          super();this.position=opts.position;this.title=opts.title??'';this.setAttribute('role','button');this.tabIndex=0;
          if(opts.content)this.append(opts.content);
          this.addEventListener('click',e=>{e.stopPropagation();this.dispatchEvent(new Event('gmp-click'));});
          this.addEventListener('keydown',e=>{if(e.key==='Enter')this.click();});
          if(opts.map)this.map=opts.map;
        }
        set map(map){this._map=map;if(map)map.pins.append(this);else this.remove();}
        get map(){return this._map;}
        addListener(name,handler){return event.addListener(this,name,handler);}
      }
      customElements.define('test-google-marker',AdvancedMarkerElement);
      class InfoWindow {
        constructor(opts={}){this.content=opts.content;}
        setContent(content){this.content=content;}
        setPosition(){}
        open({map}){this.close();this.element=document.createElement('div');this.element.style.cssText='background:white;padding:12px;position:absolute;top:5px;left:5px;max-width:280px;z-index:10';this.element.append(this.content);map.container.append(this.element);}
        close(){this.element?.remove();}
      }
      class Polyline { constructor(){window.__routeDrawn++;}setMap(){} }
      class Circle { setMap(){} }
      const Route={computeRoutes:async request=>{
        window.__routeCalls.push(request);
        if(options.delayed)await new Promise(resolve=>setTimeout(resolve,1200));
        if(options.quota)throw Object.assign(new Error('quota'),{code:'RESOURCE_EXHAUSTED'});
        return {routes:options.empty?[]:[{distanceMeters:3200,durationMillis:540000,path:[{lat:5.54,lng:-73.36},{lat:5.5353,lng:-73.3678}],warnings:['Precaución: verifica el acceso a la sede.']}]};
      }};
      const maps={Map,Polyline,Circle,InfoWindow,LatLng,LatLngBounds,OverlayView,event,ColorScheme:{LIGHT:'LIGHT'},marker:{AdvancedMarkerElement}};
      maps.importLibrary=async name=>name==='routes'?{Route}:name==='marker'?maps.marker:maps;
      window.google={maps}; window.${callback}();
    })();`,
      });
    },
  );
}
