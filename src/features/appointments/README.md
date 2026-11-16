# Citas

HU18 está implementada en `/citas`: consulta por sede, servicio, fecha y profesional, modalidad/zona, actualización, apartado temporal y borradores offline.

`model.ts` valida los datos; `api.ts` gestiona consultas/RPC y borradores; `AvailabilityPage.tsx` ofrece el recorrido público y los controles de cuenta.

Un apartado dura cinco minutos y no crea una cita solicitada ni confirmada. Un borrador no ocupa ni se envía al reconectar. HU19 y siguientes deberán añadir mascota, solicitud, estados y agenda, revalidando y consumiendo el apartado en la misma transacción.

Consultar [HU17-HU18](../../../docs/hu17-hu18.md) y `AGENTS.md` antes de ampliar el dominio.
