import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../useAuth';
import { authClient, withAuthOperation } from '../api';
import {
  accountContextSchema,
  accountTypeLabels,
  type AccountType,
} from '../account-types';
import { useOnline } from '@/pwa/useOnline';
import { Notice } from '@/features/directory/Workspace';
import { dataError } from '@/features/directory/api';

export function AccountTypePicker() {
  const auth = useAuth();
  const online = useOnline();
  const cache = useQueryClient();
  const [kind, setKind] = useState<AccountType | ''>('');
  const save = useMutation({
    networkMode: 'always',
    mutationFn: () =>
      withAuthOperation(async () => {
        const { data, error } = await authClient().rpc('select_account_type', {
          p_type: kind,
        });
        if (error) throw error;
        return accountContextSchema.parse(data);
      }),
    onSuccess: async (context) => {
      cache.setQueryData(['account-context', auth.user?.id], context);
      await cache.invalidateQueries({
        queryKey: ['account-context', auth.user?.id],
      });
    },
  });
  return (
    <form
      className="sv-card space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (kind && online) save.mutate();
      }}
    >
      <h2 className="font-semibold">Elige tu tipo de cuenta</h2>
      <p className="text-sm">
        Esta cuenta se creó antes de separar los recorridos. Elige cómo la
        usarás. Esta elección no aprueba establecimientos ni concede permisos de
        equipo.
      </p>
      <fieldset className="space-y-3">
        <legend className="sr-only">Tipo de cuenta</legend>
        {(['pet_owner', 'veterinary'] as const).map((value) => (
          <label
            key={value}
            className="flex gap-3 rounded-xl border border-brand-100 p-4"
          >
            <input
              type="radio"
              name="kind"
              value={value}
              checked={kind === value}
              onChange={() => setKind(value)}
              disabled={save.isPending}
              required
            />
            <span>{accountTypeLabels[value]}</span>
          </label>
        ))}
      </fieldset>
      <p className="text-xs">
        Cada cuenta usa un solo recorrido. Para utilizar el otro, registra una
        cuenta separada.
      </p>
      <button
        className="button button-primary"
        disabled={!online || !kind || save.isPending}
      >
        {save.isPending ? 'Guardando elección…' : 'Guardar tipo de cuenta'}
      </button>
      {!online && (
        <Notice>Conecta para guardar esta elección en el servidor.</Notice>
      )}
      {save.isError && <Notice error>{dataError(save.error)}</Notice>}
    </form>
  );
}
