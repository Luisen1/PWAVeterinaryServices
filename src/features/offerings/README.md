# Servicios y disponibilidad

HU07-HU08: catálogo por sede, profesionales, recursos, asignaciones compatibles, jornadas y cierres excepcionales. Incluye invitaciones con aceptación por correo confirmado, permisos por establecimiento y revocación. Las escrituras se validan en PostgreSQL mediante RPC y revisión esperada; las tablas no admiten escrituras directas del cliente.

`model.ts` define documentos y validaciones; `api.ts` encapsula las RPC; `OfferingsPage.tsx` presenta configuración e intervalos; `PublicServices.tsx` presenta el catálogo activo de sedes publicadas. La quinta migración implementa RLS y disponibilidad con zonas horarias, medianoche, horarios de sede, excepciones y ocupaciones.

Rutas: `/oferentes/servicios` y `/oferentes/:id/servicios`. Recorrido, criterios, pruebas y límites en `docs/hu07-hu09.md`. La reserva de citas corresponde a HU18 y siguientes.
