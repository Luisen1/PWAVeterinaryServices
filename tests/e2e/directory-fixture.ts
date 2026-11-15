import type { BrowserContext } from '@playwright/test';
import { TEST_USER_ID } from './auth-fixture';
import { E2E_ENVIRONMENT } from './environment';
import type {
  Decision,
  Establishment,
  EstablishmentDocument,
  Pet,
  Publication,
} from '../../src/features/directory/model';

export async function mockDirectoryApi(
  context: BrowserContext,
  getRole: () => string,
) {
  let profile = {
    id: TEST_USER_ID,
    display_name: 'Persona de prueba',
    phone: '',
  };
  const pets: Pet[] = [];
  const establishments: Establishment[] = [];
  const decisions: Decision[] = [];
  const publications: Publication[] = [];
  let failProfile = false;
  const now = () => new Date().toISOString();
  await context.route(
    `${E2E_ENVIRONMENT.VITE_SUPABASE_URL}/**`,
    async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      const path = url.pathname;
      if (path.endsWith('/offering_items')) {
        await route.fulfill({ json: [] });
        return;
      }
      const body =
        request.postData() &&
        request.headers()['content-type']?.includes('json')
          ? request.postDataJSON()
          : null;
      if (path.endsWith('/profiles')) {
        if (request.method() === 'PATCH') {
          if (failProfile) {
            await route.fulfill({
              status: 503,
              json: { message: 'Temporalmente sin conexión' },
            });
            return;
          }
          profile = { ...profile, ...body };
        }
        await route.fulfill({ json: profile });
        return;
      }
      if (path.endsWith('/pets')) {
        if (request.method() === 'DELETE') {
          const id = url.searchParams.get('id')?.slice(3);
          const i = pets.findIndex((p) => p.id === id);
          if (i >= 0) pets.splice(i, 1);
          await route.fulfill({ json: { id } });
          return;
        }
        await route.fulfill({ json: pets });
        return;
      }
      if (path.endsWith('/rpc/save_pet')) {
        const i = pets.findIndex((p) => p.id === body.p_id);
        const pet = {
          id: body.p_id,
          owner_id: TEST_USER_ID,
          name: body.p_name,
          species: body.p_species,
          updated_at: now(),
        };
        if (i < 0) pets.push(pet);
        else pets[i] = pet;
        await route.fulfill({ json: pet.id });
        return;
      }
      if (path.endsWith('/rpc/submit_establishment')) {
        const existing = establishments.find((e) => e.id === body.p_id);
        if (existing) {
          existing.document = body.p_document;
          existing.revision++;
          existing.status = 'pending';
          existing.updated_at = now();
        } else
          establishments.push({
            id: crypto.randomUUID(),
            owner_id: TEST_USER_ID,
            document: body.p_document as EstablishmentDocument,
            status: 'pending',
            revision: 1,
            created_at: now(),
            updated_at: now(),
          });
        await route.fulfill({
          json: existing?.id ?? establishments.at(-1)!.id,
        });
        return;
      }
      if (path.endsWith('/rpc/review_establishment')) {
        if (getRole() !== 'admin') {
          await route.fulfill({
            status: 403,
            json: { code: '42501', message: 'Solo administración' },
          });
          return;
        }
        const row = establishments.find((e) => e.id === body.p_id)!;
        row.status = body.p_decision;
        decisions.push({
          id: crypto.randomUUID(),
          establishment_id: row.id,
          revision: row.revision,
          decision: body.p_decision,
          reason: body.p_reason,
          reviewer_id: TEST_USER_ID,
          decided_at: now(),
        });
        if (body.p_decision === 'approved') {
          const { responsible_name: _private, ...document } = row.document;
          void _private;
          const publication = {
            id: row.id,
            document,
            revision: row.revision,
            published_at: now(),
          };
          const i = publications.findIndex((p) => p.id === row.id);
          if (i < 0) publications.push(publication);
          else publications[i] = publication;
        }
        await route.fulfill({ json: null });
        return;
      }
      if (path.endsWith('/establishments')) {
        let rows = establishments.map((e) => ({
          ...e,
          establishment_decisions: decisions.filter(
            (d) => d.establishment_id === e.id,
          ),
        }));
        if (url.searchParams.has('status'))
          rows = rows.filter(
            (e) => e.status === url.searchParams.get('status')!.slice(3),
          );
        if (url.searchParams.has('id'))
          rows = rows.filter(
            (e) => e.id === url.searchParams.get('id')!.slice(3),
          );
        await route.fulfill({
          json: request.headers().accept?.includes('vnd.pgrst.object')
            ? rows[0]
            : rows,
        });
        return;
      }
      if (path.endsWith('/establishment_publications')) {
        const id = url.searchParams.get('id')?.slice(3);
        await route.fulfill({
          json: id
            ? (publications.find((p) => p.id === id) ?? null)
            : publications,
        });
        return;
      }
      if (path.startsWith('/storage/v1/object/sign/')) {
        await route.fulfill({
          json: { signedURL: '/object/public/fixture.png' },
        });
        return;
      }
      if (path.startsWith('/storage/v1/object/public/')) {
        await route.fulfill({
          contentType: 'image/png',
          body: Buffer.from(
            'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jZ1kAAAAASUVORK5CYII=',
            'base64',
          ),
        });
        return;
      }
      if (
        path.startsWith('/storage/v1/object/establishment-media/') &&
        request.method() === 'POST'
      ) {
        await route.fulfill({
          json: { Key: path.split('/storage/v1/object/')[1] },
        });
        return;
      }
      await route.fallback();
    },
  );
  return {
    pets,
    establishments,
    publications,
    decisions,
    setProfileFailure: (value: boolean) => {
      failProfile = value;
    },
  };
}
