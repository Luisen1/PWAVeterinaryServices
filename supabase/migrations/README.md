# Migraciones remotas

Aplicar las migraciones en orden al proyecto Supabase de desarrollo.

1. `20261114000000_enable_extensions.sql` habilita PostGIS y btree_gist.
2. `20261114010000_identity_and_access.sql` crea perfiles, consentimientos, roles, trigger de registro y RLS de HU01/HU02.
3. `20261114192538_profiles_providers_and_review.sql` añade teléfono, mascotas, solicitudes, publicaciones, revisión administrativa, invitación de administrador y Storage privado para HU03/HU06.
4. `20261114194307_account_data_guards.sql` valida nombres de perfil en el servidor y protege la consulta de rol mediante una fachada sin privilegios elevados.
5. `20261115192045_services_availability_and_collaborators.sql` añade servicios, profesionales, recursos, jornadas, bloqueos, intervalos, referencias de agenda e invitaciones con permisos para HU07/HU08.
6. `20261115210218_discovery_filters_and_private_preferences.sql` admite urgencias declaradas en servicios y crea preferencias de favorito/nota, RLS por cuenta y RPC con revisión e idempotencia para HU13-HU15.
7. `20261116002733_reservable_availability_and_slot_holds.sql` añade consulta reservable publicada, apartados temporales privados y triggers compartidos para prevenir solapes con las referencias de citas.
8. `20261116002913_index_slot_hold_references.sql` completa los índices de FK de profesional/recurso de los apartados.
9. `20261116024136_appointment_requests_and_decisions.sql` añade solicitudes presenciales/virtuales con mascota, ocupación, RLS, revisión, decisiones y eventos de aviso.
10. `20261116024351_count_pending_requests_on_blocks.sql` incluye solicitudes pendientes al advertir citas afectadas por un bloqueo.
11. `20261116025001_normalize_appointment_request_pages.sql` normaliza vencimientos de cada página con cursor estable y bloqueos ordenados.
12. `20261116150201_appointment_changes_and_agenda.sql` añade reglas publicadas, cambios atómicos/idempotentes, auditoría y agenda con filtros.
13. `20261116150210_authorized_text_messaging.sql` añade permiso `messages`, conversaciones, mensajes, recibos, RLS, RPC y publicación Realtime.
14. `20261116150621_reject_blank_chat_messages.sql` rechaza texto compuesto únicamente por espacios, tabulaciones o saltos de línea.
15. `20261116151747_allow_public_appointment_policy_reads.sql` permite consulta pública de reglas mediante un auxiliar protegido, sin conceder gestión a visitantes.
16. `20261116165558_private_chat_media_and_call_authorization.sql` añade archivos privados y publicación de backend, asignación de cuenta profesional, autorización de salas e invalidación/cierre.

Las dieciséis migraciones están aplicadas/alineadas en `veterinary-services-dev` (`osoljaiqizmcxxlirrwo`), comprobado el 2026-11-16. Las versiones 7–11 con fecha UTC 2026-11-16 se aplicaron el 2026-11-15 en `America/Bogota`; las cinco últimas el 2026-11-16. No volver a ejecutarlas manualmente sobre este proyecto.

La segunda migración exige `privacy_accepted: true` y `privacy_policy_version: '2026-11-14'` al registrar una cuenta. Asigna el rol `user` y preserva los consentimientos existentes. Las cuentas previas obtienen un perfil y rol básico mediante backfill, sin fabricar aceptación del aviso.

Las pruebas de `tests/database/identity.test.ts` ejecutan el SQL de identidad en PostgreSQL embebido, con el esquema Auth mínimo de prueba. La aplicación y validación en Supabase se documenta en `docs/autenticacion.md`.

La cobertura de HU03-HU06, las decisiones de seguridad y la aceptación manual pendiente se documentan en `docs/hu01-hu06.md`. La integración remota reproducible está en `supabase/tests/hu03_hu06.sql`.

HU07-HU09 se documentan en `docs/hu07-hu09.md`, con integración remota en `supabase/tests/hu07_hu09.sql` y pruebas en `tests/database/offerings.test.ts`. El mapa se verifica en `tests/e2e/map.spec.ts`.

HU13-HU15 se documentan en `docs/hu13-hu15.md`. `supabase/tests/hu13_hu15.sql` pasó contra desarrollo con rollback y comprueba urgencias tipadas, privacidad entre cuentas, accesos denegados, revisión e idempotencia. La cobertura local amplía `tests/database/offerings.test.ts`.

HU18 se verifica con `supabase/tests/hu18.sql`, ejecutado en desarrollo con rollback, y las pruebas locales de oferta. El apartado temporal no crea una solicitud de cita. HU19-HU21 lo consumen/revalidan dentro de su transacción de solicitud y se verifican con `supabase/tests/hu19_hu21.sql` y `tests/database/appointments.test.ts`; ver [guía](../../docs/hu19-hu21.md).

Los datos ficticios de Tunja están separados en `supabase/seed.sql`; no forman parte de estas migraciones. Ver [carga, escenarios e idempotencia](../../docs/datos-demostracion.md). Ya se cargaron en el proyecto de desarrollo: seis establecimientos publicados y siete sedes.

HU22-HU24 se verifican con `supabase/tests/hu22_hu24.sql`, ejecutado contra desarrollo con rollback. La prueba de Realtime real utilizó cuentas técnicas temporales que fueron retiradas; ver [guía](../../docs/hu22-hu24.md).

HU25-HU27 se verifican con `supabase/tests/hu25_hu27.sql`, con rollback, y HTTP real de archivos contra Edge/Storage con fixtures retirados. LiveKit Cloud y Cron/pg_net de cierre no se han activado: ver [guía](../../docs/hu25-hu27.md). `supabase/operations/enable_call_maintenance.sql` es una operación manual posterior, no una migración aplicada.
