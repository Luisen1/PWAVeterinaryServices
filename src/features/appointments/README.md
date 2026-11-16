# Citas

HU18 está implementada en `/citas`: consulta por sede, servicio, fecha y profesional, modalidad/zona, actualización, apartado temporal y borradores offline.

`model.ts` valida los datos; `api.ts` gestiona consultas/RPC y borradores; `AvailabilityPage.tsx` ofrece el recorrido público y los controles de cuenta.

HU19-HU21 añaden solicitudes presenciales y virtuales con mascota propia, revalidación/consumo atómico del apartado, detalle privado, confirmación/rechazo y eventos de aviso. `requests-model.ts` valida el contrato, `requests-api.ts` realiza operaciones por cuenta y `RequestForm.tsx`/`RequestsPage.tsx` ofrecen los recorridos. La decisión exige responsable o permiso `schedule`; `read` solo consulta.

Un apartado dura cinco minutos y no crea una cita solicitada ni confirmada. Un borrador no ocupa ni se envía al reconectar. Una solicitud sí ocupa el intervalo hasta confirmarse, rechazarse o vencer al inicio previsto. Cancelación/reprogramación y agenda completa pertenecen a HU22-HU23.

Consultar [HU17-HU18](../../../docs/hu17-hu18.md), [HU19-HU21](../../../docs/hu19-hu21.md) y `AGENTS.md` antes de ampliar el dominio.
