# Directorio

Implementa HU03-HU06: perfil y mascotas, registro de oferentes con logo, revisión administrativa y fichas con sedes, ubicación, fotos, horarios, excepciones y medios de pago.

Las solicitudes privadas y las publicaciones aprobadas se almacenan por separado. Las decisiones se auditan y requieren rol administrativo en el servidor. Los cambios posteriores conservan la publicación anterior mientras se revisan. Las imágenes utilizan un bucket privado y URLs firmadas; solo se permite lectura pública de referencias aprobadas.

Las rutas se registran en `src/routes/router.tsx`. Consulta `docs/hu01-hu06.md` para configurar, probar y conocer los límites. La búsqueda geográfica, filtros y mapa integrado corresponden a fases posteriores.
