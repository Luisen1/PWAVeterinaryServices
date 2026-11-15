import type { BrowserContext } from '@playwright/test';
import { E2E_ENVIRONMENT } from './environment';
import { TEST_EMAIL, TEST_USER_ID } from './auth-fixture';
import { blankEstablishment } from '../../src/features/directory/model';
import type {
  Invitation,
  Item,
  OfferingWorkspace,
} from '../../src/features/offerings/model';

export const OFFERING_ESTABLISHMENT = '44444444-4444-4444-8444-444444444444';
export const OFFERING_SITE = '55555555-5555-4555-8555-555555555555';
export const offeringDocument = {
  ...blankEstablishment(),
  name: 'Veterinaria Horizonte',
  phone: '3001234567',
  email: 'contacto@example.test',
  responsible_name: 'Responsable',
  sites: [
    {
      ...blankEstablishment().sites[0]!,
      id: OFFERING_SITE,
      name: 'Sede central',
      address: 'Calle 20 # 10-30',
      latitude: 5.5353,
      longitude: -73.3678,
      coordinates_confirmed: true,
      phone: '3001234567',
      hours: [{ day: 1, open: '08:00', close: '17:00', next_day: false }],
    },
  ],
};
export async function mockOfferings(
  context: BrowserContext,
  options: { owner?: boolean; invited?: boolean } = {},
) {
  const owner = options.owner ?? true;
  const workspaces: OfferingWorkspace[] = options.invited
    ? []
    : [
        {
          id: OFFERING_ESTABLISHMENT,
          name: offeringDocument.name,
          sites: offeringDocument.sites,
          owner,
          permissions: owner ? ['services', 'schedule', 'read'] : ['read'],
        },
      ];
  const items: Item[] = [];
  const invitations: Invitation[] = options.invited
    ? [
        {
          id: crypto.randomUUID(),
          establishment_id: OFFERING_ESTABLISHMENT,
          establishment_name: offeringDocument.name,
          email: TEST_EMAIL,
          user_id: null,
          permissions: ['read'],
          status: 'pending',
          expires_at: new Date(Date.now() + 86400000).toISOString(),
        },
      ]
    : [];
  let failSave = false;
  await context.route(
    `${E2E_ENVIRONMENT.VITE_SUPABASE_URL}/rest/v1/**`,
    async (route) => {
      const url = new URL(route.request().url());
      const body = route.request().postData()
        ? route.request().postDataJSON()
        : null;
      const path = url.pathname;
      if (path.endsWith('/rpc/offering_workspaces')) {
        await route.fulfill({ json: workspaces });
        return;
      }
      if (path.endsWith('/rpc/offering_invitations')) {
        await route.fulfill({ json: invitations });
        return;
      }
      if (path.endsWith('/rpc/manage_offering_invitation')) {
        if (body.p_action === 'accept') {
          invitations[0]!.status = 'accepted';
          invitations[0]!.user_id = TEST_USER_ID;
          workspaces.push({
            id: OFFERING_ESTABLISHMENT,
            name: offeringDocument.name,
            sites: offeringDocument.sites,
            owner: false,
            permissions: ['read'],
          });
        } else if (body.p_action === 'invite') {
          invitations.push({
            id: crypto.randomUUID(),
            establishment_id: OFFERING_ESTABLISHMENT,
            establishment_name: offeringDocument.name,
            email: body.p_email,
            permissions: body.p_permissions,
            status: 'pending',
            user_id: null,
            expires_at: new Date(Date.now() + 7 * 86400000).toISOString(),
          });
        } else {
          invitations.find((i) => i.id === body.p_id)!.status = 'revoked';
        }
        await route.fulfill({ json: body.p_id ?? invitations.at(-1)?.id });
        return;
      }
      if (path.endsWith('/rpc/save_offering_item')) {
        if (failSave) {
          await route.fulfill({
            status: 503,
            json: { message: 'Temporalmente sin servicio' },
          });
          return;
        }
        const existing = items.find((i) => i.id === body.p_id);
        if (existing) {
          existing.document = body.p_document;
          existing.revision++;
        } else
          items.push({
            id: body.p_id,
            establishment_id: body.p_establishment,
            kind: body.p_kind,
            document: body.p_document,
            revision: 1,
            updated_at: new Date().toISOString(),
          });
        await route.fulfill({
          json: { affected_appointments: body.p_kind === 'block' ? 2 : 0 },
        });
        return;
      }
      if (path.endsWith('/offering_items')) {
        let results = items;
        if (url.searchParams.has('establishment_id'))
          results = results.filter(
            (i) =>
              i.establishment_id ===
              url.searchParams.get('establishment_id')!.slice(3),
          );
        if (url.searchParams.has('kind'))
          results = results.filter(
            (i) => i.kind === url.searchParams.get('kind')!.slice(3),
          );
        if (url.searchParams.has('document->>active'))
          results = results.filter((i) => i.document.active);
        const offset = Number(url.searchParams.get('offset') ?? 0);
        const limit = Number(url.searchParams.get('limit') ?? results.length);
        results = results.slice(offset, offset + limit);
        await route.fulfill({ json: results });
        return;
      }
      if (path.endsWith('/rpc/offering_slots')) {
        await route.fulfill({
          json: items.some((i) => i.kind === 'block' && i.document.active)
            ? []
            : [
                {
                  assignment_id: '99999999-9999-4999-8999-999999999999',
                  starts_at: `${body.p_date}T13:00:00Z`,
                  ends_at: `${body.p_date}T13:30:00Z`,
                  timezone: 'America/Bogota',
                },
              ],
        });
        return;
      }
      await route.fallback();
    },
  );
  return {
    items,
    invitations,
    setSaveFailure: (value: boolean) => {
      failSave = value;
    },
  };
}
