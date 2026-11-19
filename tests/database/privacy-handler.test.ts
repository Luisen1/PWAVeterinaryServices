import { beforeEach, expect, it, vi } from 'vitest';
import type { User } from '@supabase/supabase-js';
import {
  createPrivacyHandler,
  exportSections,
} from '../../supabase/functions/account-data/handler';
const id = '11111111-1111-4111-8111-111111111111',
  requestId = '22222222-2222-4222-8222-222222222222';
const role = vi.fn();
const rpc = vi.fn();
const signIn = vi.fn();
const signOut = vi.fn();
const ban = vi.fn();
const remove = vi.fn();
const deleteUser = vi.fn();
const signed = vi.fn();
const env = (key: string) =>
  ({
    SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_ANON_KEY: 'public-test-key',
  })[key];
const dependencies = { authenticate: vi.fn(), createClient: vi.fn() };
const handler = createPrivacyHandler(
  env,
  dependencies as unknown as Parameters<typeof createPrivacyHandler>[1],
);
beforeEach(() => {
  vi.resetAllMocks();
  role.mockResolvedValue({ data: 'user', error: null });
  signIn.mockResolvedValue({
    data: { user: { id }, session: { access_token: 'temporary-proof' } },
    error: null,
  });
  signOut.mockResolvedValue({ error: null });
  ban.mockResolvedValue({ error: null });
  deleteUser.mockResolvedValue({ error: null });
  remove.mockResolvedValue({ error: null });
  signed.mockResolvedValue({
    data: { signedUrl: 'https://example.invalid/private-signed-file' },
    error: null,
  });
  dependencies.createClient.mockReturnValue({
    auth: { signInWithPassword: signIn },
  });
  dependencies.authenticate.mockResolvedValue({
    user: { id, email: 'owner@example.invalid' } as User,
    userClient: { rpc: role },
    admin: {
      rpc,
      storage: { from: () => ({ remove, createSignedUrl: signed }) },
      auth: { admin: { signOut, updateUserById: ban, deleteUser } },
    },
  });
  rpc.mockImplementation(
    async (name: string, args: Record<string, unknown>) => {
      if (name === 'export_account_page')
        return {
          data: args.p_section === 'profile' ? { id } : [],
          error: null,
        };
      if (name === 'begin_account_deletion')
        return {
          data: {
            owner_id: requestId,
            status: 'processing',
            objects: [{ bucket_id: 'chat-media', name: 'private/path' }],
            rooms: [],
            identity_deleted: false,
          },
          error: null,
        };
      return { data: { id: requestId, status: 'requested' }, error: null };
    },
  );
});
function post(body: Record<string, unknown>) {
  return handler(
    new Request('http://localhost/account-data', {
      method: 'POST',
      headers: {
        Origin: 'http://localhost:4173',
        'Content-Type': 'application/json',
        Authorization: 'Bearer caller',
      },
      body: JSON.stringify(body),
    }),
  );
}
it('exige reautenticación sin invocar funciones privilegiadas cuando falla', async () => {
  signIn.mockResolvedValue({
    data: { user: null, session: null },
    error: { message: 'wrong' },
  });
  expect(
    (await post({ action: 'export', password: 'incorrecta' })).status,
  ).toBe(401);
  expect(rpc).not.toHaveBeenCalled();
});
it('rechaza otro usuario como prueba y no confía en el owner que envía el cliente', async () => {
  signIn.mockResolvedValue({
    data: { user: { id: requestId }, session: {} },
    error: null,
  });
  expect(
    (await post({ action: 'export', password: 'clave', owner: requestId }))
      .status,
  ).toBe(401);
  expect(rpc).not.toHaveBeenCalled();
});
it('exporta páginas propias, no almacena la contraseña y revoca la sesión temporal', async () => {
  rpc.mockImplementation(
    async (name: string, args: Record<string, unknown>) => ({
      data:
        name === 'export_account_page' &&
        args.p_section === 'messages' &&
        args.p_offset === 0
          ? Array.from({ length: 500 }, (_, i) => ({ id: i }))
          : [],
      error: null,
    }),
  );
  const response = await post({
    action: 'export',
    password: 'clave',
    owner: requestId,
  });
  expect(response.status).toBe(200);
  expect(response.headers.get('cache-control')).toBe('no-store');
  const result = await response.json();
  expect(result.messages).toHaveLength(500);
  expect(result.password).toBeUndefined();
  expect(result.account.id).toBe(id);
  expect(rpc.mock.calls.every(([, args]) => args.p_actor === id)).toBe(true);
  expect(rpc.mock.calls).toHaveLength(exportSections.length + 1);
  expect(signOut).toHaveBeenCalledWith('temporary-proof', 'local');
});
it('rechaza procesamiento de un usuario común antes de reautenticar', async () => {
  expect(
    (
      await post({
        action: 'process_deletion',
        id: requestId,
        password: 'clave',
        confirmation: 'PROCESAR',
      })
    ).status,
  ).toBe(403);
  expect(rpc).not.toHaveBeenCalled();
  expect(signIn).not.toHaveBeenCalled();
});
it('solicita eliminación solo con confirmación y actor derivado del servidor', async () => {
  expect(
    (
      await post({
        action: 'request_deletion',
        id: requestId,
        password: 'clave',
        confirmation: 'NO',
      })
    ).status,
  ).toBe(400);
  expect(rpc).not.toHaveBeenCalled();
  expect(
    (
      await post({
        action: 'request_deletion',
        id: requestId,
        password: 'clave',
        confirmation: 'ELIMINAR',
        owner: 'other',
      })
    ).status,
  ).toBe(200);
  expect(rpc).toHaveBeenCalledWith('request_account_deletion', {
    p_actor: id,
    p_id: requestId,
  });
});
it('procesa por etapas y no declara éxito si la identidad no pudo retirarse', async () => {
  role.mockResolvedValue({ data: 'admin', error: null });
  deleteUser.mockResolvedValue({ error: { code: 'error' } });
  expect(
    (
      await post({
        action: 'process_deletion',
        id: requestId,
        password: 'clave',
        confirmation: 'PROCESAR',
      })
    ).status,
  ).toBe(503);
  expect(remove).toHaveBeenCalledWith(['private/path']);
  expect(deleteUser).toHaveBeenCalledWith(requestId, true);
  expect(
    rpc.mock.calls.some(([name]) => name === 'complete_account_deletion'),
  ).toBe(false);
  expect(signOut).toHaveBeenCalled();
});
it('recupera un borrado de Auth aceptado cuya respuesta final se perdió', async () => {
  role.mockResolvedValue({ data: 'admin', error: null });
  rpc
    .mockResolvedValueOnce({
      data: {
        owner_id: requestId,
        status: 'processing',
        identity_deleted: true,
        objects: [],
        rooms: [],
      },
      error: null,
    })
    .mockResolvedValue({ error: null });
  const response = await post({
    action: 'process_deletion',
    id: requestId,
    password: 'clave',
    confirmation: 'PROCESAR',
  });
  expect(response.status).toBe(200);
  expect(rpc).toHaveBeenCalledWith('complete_account_deletion', {
    p_id: requestId,
    p_admin: id,
  });
  expect(ban).not.toHaveBeenCalled();
  expect(deleteUser).not.toHaveBeenCalled();
});
it('rechaza orígenes ajenos y cuerpos no válidos', async () => {
  const response = await handler(
    new Request('http://localhost/account-data', {
      method: 'POST',
      headers: { Origin: 'https://foreign.invalid' },
      body: '{}',
    }),
  );
  expect(response.status).toBe(403);
  expect(dependencies.authenticate).not.toHaveBeenCalled();
  expect((await post({ action: 'unknown', password: 'clave' })).status).toBe(
    400,
  );
});
