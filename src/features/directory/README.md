# Directorio

Implementa HU03-HU06: perfil y mascotas, registro de oferentes con logo, revisión administrativa y fichas con sedes, ubicación, fotos, horarios, excepciones y medios de pago.

El perfil de contacto es común. Solo Dueño de mascota consulta/renderiza su sección de mascotas; Veterinaria tiene gestión de establecimientos y Administración conserva revisión. Los tipos y las rutas se protegen con `features/auth/AccountArea`, además de las guardas del servidor. Ver [tipos de cuenta](../../../docs/tipos-de-cuenta.md); no restaurar el menú combinado anterior.

Las solicitudes privadas y las publicaciones aprobadas se almacenan por separado. Las decisiones se auditan y requieren rol administrativo en el servidor. Los cambios posteriores conservan la publicación anterior mientras se revisan. Las imágenes utilizan un bucket privado y URLs firmadas; solo se permite lectura pública de referencias aprobadas.

HU09 añade el mapa de sedes aprobadas, pines por categoría, agrupación y selección conservada al cambiar el zoom. El listado con dirección y teléfono sigue disponible ante fallos. HU07 publica los servicios activos en la ficha mediante `features/offerings`.

Las rutas se registran en `src/routes/router.tsx`. Consulta `docs/hu01-hu06.md`, `docs/hu07-hu09.md` y `docs/hu10-hu12.md` para configurar, probar y conocer los límites. HU13-HU15 añaden filtros avanzados y preferencias privadas; HU17-HU18 incorporan cálculo interno de ruta/ETA y consulta/apartados temporales.

`MapCanvas.tsx` usa únicamente Google Maps en Explorar y Cómo llegar. `google-maps.ts` comparte SDK/opciones, y `@googlemaps/markerclusterer` agrupa marcadores avanzados. El cálculo añade una polilínea al mismo mapa sin reemplazarlo; quitarla conserva el lienzo. `google-routes.ts` consulta Routes API solo bajo acción explícita. Configurar clave pública y, en producción, ID de mapa propio según `docs/hu17-hu18.md`. No se conservan mapas/rutas para uso offline; el listado y la navegación externa son alternativas ante fallos.

`SiteLocationPicker.tsx` reutiliza ese SDK/opciones en el paso Ubicación de `EstablishmentForm`, para registro y edición de cada sede. Se carga al abrir el selector; clic, arrastre y uso explícito del centro actualizan solo sus coordenadas y desmarcan la confirmación. El mapa inicia en el punto válido o en Tunja sin asignar automáticamente esa referencia; no modifica dirección ni origen privado del visitante. Conserva entrada manual y enlace externo ante falta de conexión/configuración/Google. No requiere Places, Geocoding ni llamadas a Routes. Escucha `dragend` del canal quarterly y `gmp-dragend` de versiones nuevas, con limpieza al cerrar.

HU10-HU12 añaden ubicación y origen manual con Tunja como referencia inicial, búsqueda de servicios por sede, alternancia de vistas y fichas con contexto conservado. `DirectionsPage.tsx` presenta la navegación externa solicitada (HU16) y `PhoneContact.tsx` ofrece llamada/copia. El origen del visitante se mantiene solo en memoria. Consulta `docs/hu10-hu12.md`; chat, reservas y cálculo de ruta/ETA interno continúan pendientes.
