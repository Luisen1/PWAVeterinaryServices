# Separación entre dueño de mascota y veterinaria

Actualización del 2026-11-16, `America/Bogota`. Cambio solicitado por el usuario sobre el registro, perfil y navegación; no añade una HU numerada ni modifica la aprobación de establecimientos.

## Registro y recorridos

El formulario exige elegir **Dueño de mascota** o **Veterinaria** antes de crear la cuenta. El consentimiento, PKCE y confirmación de correo mantienen su contrato. La API envía `account_type` en los metadatos iniciales; el trigger copia únicamente un valor permitido a la tabla privada. No admite `admin` ni concede privilegios a partir de los metadatos.

| Tipo                           | Opciones del perfil                                                                                                                                                                                                                  |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Dueño de mascota (`pet_owner`) | Datos personales, mascotas, favoritos/notas, agenda, solicitudes y conversaciones como cliente.                                                                                                                                      |
| Veterinaria (`veterinary`)     | Contacto personal, establecimientos, registro de veterinaria, catálogo/equipo/invitaciones y, según los permisos vigentes, agenda/solicitudes y chat del establecimiento. No consulta ni presenta el formulario de mascotas propias. |
| Administrador                  | Datos personales y revisión administrativa, con menú propio. No se puede elegir este rol al registrarse.                                                                                                                             |

Inicio y las navegaciones móvil/escritorio se adaptan al recorrido. Los enlaces de vuelta desde conversación, detalle de cita y sala respetan el tipo de cuenta. Las rutas del otro recorrido muestran una explicación antes de montar su contenido privado; no basta con escribir la URL para obtenerlo. Las pantallas compartidas de detalle/chat/sala mantienen su autorización por participante en el servidor, incluyendo referencias históricas.

Cada cuenta utiliza un solo recorrido. Si una persona necesita actuar también con el otro tipo, registra una cuenta separada. No se incorpora un selector para alternar roles ni se trasladan mascotas, citas o permisos entre identidades.

## Modelo y permisos

La migración `20261116184257_account_types_and_role_separation.sql` añade a `private.account_roles`:

- `account_type`: `pet_owner` o `veterinary`.
- `account_type_selected`: elección guardada o clasificación de una cuenta anterior con actividad conocida.

`role` conserva sus valores `user`, `provider` y `admin`. Es independiente del tipo: registrarse como Veterinaria comienza con rol `user`; la publicación sigue exigiendo revisión y el rol `provider` continúa asignándose tras aprobación. Invitaciones y permisos `services`, `schedule`, `read` y `messages` siguen validándose por establecimiento.

`current_account_context` tiene fachada pública invoker y auxiliar privado definer con `search_path=''`. Devuelve solo el contexto de la cuenta confirmada actual: tipo, elección, rol y capacidades de agenda/chat derivadas de propiedad o colaboración aceptada. La UI comparte una consulta por cuenta; se eliminó la consulta duplicada de rol en el perfil. `current_account_role` se conserva por compatibilidad.

La tabla privada no admite escritura del cliente. Cambiar `user_metadata.account_type` o `user_metadata.role` después del registro no modifica el tipo ni los permisos guardados. Los triggers de área también actúan al invocar los auxiliares privados: controlan mascotas, escrituras de establecimientos, aceptación de invitaciones, creación de apartados, solicitudes con propietario y conversaciones como cliente. Se conservan RLS y las comprobaciones existentes de identidad, pertenencia, disponibilidad y revisión. Las operaciones administrativas conservan su autorización previa; elegir Veterinaria no la concede.

## Cuentas anteriores y conservación de datos

La migración clasifica sin eliminar datos:

1. Responsables con establecimientos, rol `provider` o colaboraciones **aceptadas** quedan como Veterinaria.
2. Las demás cuentas con mascotas, citas propias, conversaciones como cliente o preferencias quedan como Dueño de mascota.
3. Las cuentas sin actividad suficiente deben elegir desde **Cuenta** después de confirmar el correo. Administración mantiene su panel independiente.

Si una cuenta anterior combinaba datos personales y de establecimiento, prevalece el recorrido Veterinaria. Sus mascotas y referencias históricas permanecen en la base con sus controles privados; no se borran, publican ni transfieren. Los pendientes locales también se conservan: una operación incompatible puede requerir resolución explícita, sin descartarla ni enviarla como si tuviera permisos nuevos.

`select_account_type` permite completar únicamente una elección pendiente. Deriva la identidad de Auth y bloquea su fila para serializar dos solicitudes. Repetir el mismo tipo confirma el resultado; intentar cambiarlo después se rechaza. No permite elegir administración. Los registros de clientes antiguos que omiten `account_type` quedan sin elección efectiva: el valor predeterminado no habilita operaciones de dueño hasta completarla.

## Conexión y persistencia

`useAccountContext` consulta la RPC y conserva una copia privada en `sync_meta`, por cuenta. Sin conexión requiere el comprobante vigente de sesión local por hash de token. La copia permite conservar la navegación, no concede permisos remotos. Sin contexto válido o ante error no se inventa un rol ni se muestran ambos menús. El cierre purga esa copia con los demás datos privados; no se cambió la versión de IndexedDB.

Los permisos de menú se refrescan con foco y consulta periódica online. El servidor sigue siendo la autoridad para cada acción, aunque una copia visual de permisos esté desactualizada. La primera elección exige conexión y no se encola.

## Verificación

- 206 pruebas de lógica/PostgreSQL en 24 archivos y 88 E2E completos aprobados; tipos, lint y build correctos.
- Registro de ambos tipos, ausencia de selección, menús separados, formulario de mascotas ausente en Veterinaria, rutas cruzadas, administración, fallo de contexto, navegación offline y elección de cuenta anterior.
- PostgreSQL comprueba tipos inválidos, metadatos manipulados, escritura de roles denegada, operaciones de cada área e idempotencia de la elección.
- `supabase/tests/account_types.sql` pasó localmente y contra desarrollo con rollback. Usa identidades sintéticas y claims simulados; no representa un envío de correo de registro ni un ingreso de personas reales.
- Migración aplicada y alineada en desarrollo, total diecisiete. Los conteos antes/después conservaron 3 usuarios, 3 perfiles, 1 mascota, 6 establecimientos y cero citas/conversaciones/mensajes en esa base. Los datos temporales del contrato SQL se revirtieron.
- Capturas revisadas a 320 px para dueño y veterinaria, sin desbordamiento horizontal. La aceptación en móviles físicos sigue pendiente.

No se activaron LiveKit, mantenimiento, notificaciones ni servicios ajenos a este cambio. Ver [evidencia y avisos](verificacion.md).
