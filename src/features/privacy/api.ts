import { authClient, withAuthOperation } from '@/features/auth/api';

export async function privacyAction(body: {
  action: 'export' | 'request_deletion' | 'process_deletion';
  password: string;
  id?: string;
  confirmation?: string;
}) {
  return withAuthOperation(async () => {
    if (!navigator.onLine)
      throw new Error(
        'Necesitas conexión y reautenticación. Esta acción no se guarda en la cola.',
      );
    const { data: identity, error: identityError } =
      await authClient().auth.getUser();
    if (identityError || !identity.user?.email_confirmed_at)
      throw new Error('Accede con una cuenta confirmada.');
    const { data, error } = await authClient().functions.invoke(
      'account-data',
      { body },
    );
    if (error) {
      let message =
        'No se pudo completar la acción. Reintenta; si la eliminación ya comenzó, su progreso se conserva.';
      if (error.context instanceof Response) {
        const result = (await error.context.json().catch(() => null)) as {
          message?: string;
        } | null;
        if (result?.message) message = result.message;
      }
      throw new Error(message);
    }
    return data as Record<string, unknown>;
  });
}
export async function deletionStatus() {
  const { data, error } = await authClient().rpc('account_data_status');
  if (error) throw error;
  return data as {
    id: string;
    status: 'requested' | 'processing' | 'completed';
    requested_at: string;
  } | null;
}
export async function deletionQueue() {
  const { data, error } = await authClient().rpc('account_deletion_queue');
  if (error) throw error;
  return data as {
    id: string;
    owner_id: string;
    status: string;
    requested_at: string;
  }[];
}
export function downloadAccountExport(data: Record<string, unknown>) {
  if (data.format !== 'veterinary-account-export' || data.version !== 1)
    throw new Error('La exportación no tiene el formato esperado.');
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: 'application/json;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'mis-datos-veterinaria.json';
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
