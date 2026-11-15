# Directorio

Implementa HU03-HU06: perfil y mascotas, registro de oferentes con logo, revisión administrativa y fichas con sedes, ubicación, fotos, horarios, excepciones y medios de pago.

Las solicitudes privadas y las publicaciones aprobadas se almacenan por separado. Las decisiones se auditan y requieren rol administrativo en el servidor. Los cambios posteriores conservan la publicación anterior mientras se revisan. Las imágenes utilizan un bucket privado y URLs firmadas; solo se permite lectura pública de referencias aprobadas.

HU09 añade el mapa de sedes aprobadas, pines por categoría, agrupación y selección conservada al cambiar el zoom. El listado con dirección y teléfono sigue disponible ante fallos. HU07 publica los servicios activos en la ficha mediante `features/offerings`.

Las rutas se registran en `src/routes/router.tsx`. Consulta `docs/hu01-hu06.md` y `docs/hu07-hu09.md` para configurar, probar y conocer los límites. La ubicación del visitante, los filtros avanzados y las rutas corresponden a historias posteriores.
