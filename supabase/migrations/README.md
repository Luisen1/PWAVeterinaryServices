# Migraciones remotas

Aplicar las migraciones en orden al proyecto Supabase de desarrollo.

1. `20261114000000_enable_extensions.sql` habilita PostGIS y btree_gist.
2. `20261114010000_identity_and_access.sql` crea perfiles, consentimientos, roles, trigger de registro y RLS de HU01/HU02.

La segunda migración exige `privacy_accepted: true` y `privacy_policy_version: '2026-11-14'` al registrar una cuenta. Asigna el rol `user` y preserva los consentimientos existentes. Las cuentas previas obtienen un perfil y rol básico mediante backfill, sin fabricar aceptación del aviso.

Las pruebas de `tests/database/identity.test.ts` ejecutan el SQL de identidad en PostgreSQL embebido, con el esquema Auth mínimo de prueba. La aplicación y validación en Supabase se documenta en `docs/autenticacion.md`.
