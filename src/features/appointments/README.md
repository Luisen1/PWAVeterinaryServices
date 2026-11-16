# Citas

HU18 está implementada en `/citas`: consulta por sede, servicio, fecha y profesional, modalidad/zona, actualización, apartado temporal y borradores offline.

`model.ts` valida los datos; `api.ts` gestiona consultas/RPC y borradores; `AvailabilityPage.tsx` ofrece el recorrido público y los controles de cuenta.

HU19-HU21 añaden solicitudes presenciales y virtuales con mascota propia, revalidación/consumo atómico del apartado, detalle privado, confirmación/rechazo y eventos de aviso. `requests-model.ts` valida el contrato, `requests-api.ts` realiza operaciones por cuenta y `RequestForm.tsx`/`RequestsPage.tsx` ofrecen los recorridos. La decisión exige responsable o permiso `schedule`; `read` solo consulta.

HU22-HU23 añaden reglas publicadas de cambios, cancelación/reprogramación atómicas, pendientes offline y agenda filtrada. `AppointmentChanges.tsx`, `change-store.ts`, `policy-api.ts` y `AppointmentPolicy.tsx` gestionan el recorrido. Reprogramar conserva identidad, mascota, servicio/sede/modalidad y vuelve a solicitar confirmación. Los estados completada/no asistió exigen personal autorizado y fin de una cita confirmada.

Un apartado dura cinco minutos y no crea una cita solicitada ni confirmada. Los borradores y cambios locales no ocupan ni se envían al reconectar. La cita remota conserva su vigencia hasta que el servidor acepta el cambio. La agenda está en `/citas/agenda` y `/oferentes/agenda`; no cambia el contrato de las listas HU19-HU21.

Consultar [HU17-HU18](../../../docs/hu17-hu18.md), [HU19-HU21](../../../docs/hu19-hu21.md), [HU22-HU24](../../../docs/hu22-hu24.md) y `AGENTS.md` antes de ampliar el dominio.

HU27 prepara acceso desde una virtual confirmada a `/citas/solicitudes/:id/videollamada`. Responsable/schedule asigna una cuenta verificada al profesional; solo esa cuenta y el cliente reciben autorización dentro de la ventana. LiveKit Cloud y el mantenimiento no están activados; ver [HU25-HU27](../../../docs/hu25-hu27.md) antes de declarar una llamada operativa.
