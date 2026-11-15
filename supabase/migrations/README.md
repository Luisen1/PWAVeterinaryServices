# Migraciones remotas

Aplicar las migraciones en orden al proyecto Supabase de desarrollo.

1. `20261114000000_enable_extensions.sql` habilita PostGIS y btree_gist.
2. `20261114010000_identity_and_access.sql` crea perfiles, consentimientos, roles, trigger de registro y RLS de HU01/HU02.
3. `20261114192538_profiles_providers_and_review.sql` añade teléfono, mascotas, solicitudes, publicaciones, revisión administrativa, invitación de administrador y Storage privado para HU03/HU06.
4. `20261114194307_account_data_guards.sql` valida nombres de perfil en el servidor y protege la consulta de rol mediante una fachada sin privilegios elevados.
5. `20261115192045_services_availability_and_collaborators.sql` añade servicios, profesionales, recursos, jornadas, bloqueos, intervalos, referencias de agenda e invitaciones con permisos para HU07/HU08.
6. `20261115210218_discovery_filters_and_private_preferences.sql` admite urgencias declaradas en servicios y crea preferencias de favorito/nota, RLS por cuenta y RPC con revisión e idempotencia para HU13-HU15.

Las seis migraciones están aplicadas en `veterinary-services-dev` (`osoljaiqizmcxxlirrwo`). Sus versiones remotas están alineadas con estos archivos. No volver a ejecutarlas manualmente sobre este proyecto.

La segunda migración exige `privacy_accepted: true` y `privacy_policy_version: '2026-11-14'` al registrar una cuenta. Asigna el rol `user` y preserva los consentimientos existentes. Las cuentas previas obtienen un perfil y rol básico mediante backfill, sin fabricar aceptación del aviso.

Las pruebas de `tests/database/identity.test.ts` ejecutan el SQL de identidad en PostgreSQL embebido, con el esquema Auth mínimo de prueba. La aplicación y validación en Supabase se documenta en `docs/autenticacion.md`.

La cobertura de HU03-HU06, las decisiones de seguridad y la aceptación manual pendiente se documentan en `docs/hu01-hu06.md`. La integración remota reproducible está en `supabase/tests/hu03_hu06.sql`.

HU07-HU09 se documentan en `docs/hu07-hu09.md`, con integración remota en `supabase/tests/hu07_hu09.sql` y pruebas en `tests/database/offerings.test.ts`. El mapa se verifica en `tests/e2e/map.spec.ts`.

HU13-HU15 se documentan en `docs/hu13-hu15.md`. `supabase/tests/hu13_hu15.sql` pasó contra desarrollo con rollback y comprueba urgencias tipadas, privacidad entre cuentas, accesos denegados, revisión e idempotencia. La cobertura local amplía `tests/database/offerings.test.ts`.
