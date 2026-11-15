# Directorio

Implementa HU03-HU06: perfil y mascotas, registro de oferentes con logo, revisión administrativa y fichas con sedes, ubicación, fotos, horarios, excepciones y medios de pago.

Las solicitudes privadas y las publicaciones aprobadas se almacenan por separado. Las decisiones se auditan y requieren rol administrativo en el servidor. Los cambios posteriores conservan la publicación anterior mientras se revisan. Las imágenes utilizan un bucket privado y URLs firmadas; solo se permite lectura pública de referencias aprobadas.

HU09 añade el mapa de sedes aprobadas, pines por categoría, agrupación y selección conservada al cambiar el zoom. El listado con dirección y teléfono sigue disponible ante fallos. HU07 publica los servicios activos en la ficha mediante `features/offerings`.

Las rutas se registran en `src/routes/router.tsx`. Consulta `docs/hu01-hu06.md`, `docs/hu07-hu09.md` y `docs/hu10-hu12.md` para configurar, probar y conocer los límites. Los filtros avanzados, favoritos y cálculo interno de ruta/ETA corresponden a historias posteriores.

HU10-HU12 añaden ubicación y origen manual con Tunja como referencia inicial, búsqueda de servicios por sede, alternancia de vistas y fichas con contexto conservado. `DirectionsPage.tsx` presenta la navegación externa solicitada (HU16) y `PhoneContact.tsx` ofrece llamada/copia. El origen del visitante se mantiene solo en memoria. Consulta `docs/hu10-hu12.md`; chat, reservas y cálculo de ruta/ETA interno continúan pendientes.
