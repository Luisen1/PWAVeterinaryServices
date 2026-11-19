import { useEffect, useId, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router';
import { useMutation } from '@tanstack/react-query';
import { useAuth } from '@/features/auth/useAuth';
import { authWithReturn } from '@/features/auth/return-to';
import { acquireReloadBlock } from '@/pwa/reload-safety';
import { useOnline } from '@/pwa/useOnline';
import { appointmentRpc } from '@/features/appointments/requests-api';
import {
  Notice,
  fieldClass,
  secondaryClass,
} from '@/features/directory/Workspace';
import { reportCategories, reportError } from './api';
export function ReportButton({
  kind,
  target,
  site = null,
  compact = false,
}: {
  kind: 'establishment' | 'message';
  target: string;
  site?: string | null;
  compact?: boolean;
}) {
  const auth = useAuth(),
    online = useOnline(),
    location = useLocation(),
    dialog = useRef<HTMLDialogElement>(null),
    label = useId();
  const [category, setCategory] = useState<keyof typeof reportCategories>(
    'incorrect_information',
  );
  const [reason, setReason] = useState('');
  const [operation, setOperation] = useState(() => crypto.randomUUID());
  const submit = useMutation({
    mutationFn: () =>
      appointmentRpc('submit_report', {
        p_id: operation,
        p_kind: kind,
        p_target: target,
        p_site: site,
        p_category: category,
        p_reason: reason,
      }),
  });
  useEffect(() => {
    if (reason && !submit.isSuccess)
      return acquireReloadBlock('reporte sin enviar');
  }, [reason, submit.isSuccess]);
  if (!auth.user?.email_confirmed_at)
    return compact ? null : (
      <Link
        className={secondaryClass}
        to={authWithReturn('/acceso', location.pathname + location.search)}
      >
        Inicia sesión para reportar información
      </Link>
    );
  return (
    <>
      <button
        type="button"
        className={compact ? 'text-xs underline' : secondaryClass}
        disabled={!online}
        onClick={() => dialog.current?.showModal()}
        aria-label={
          kind === 'message'
            ? 'Reportar este mensaje'
            : 'Reportar información de esta sede'
        }
      >
        {compact ? 'Reportar' : 'Reportar información'}
      </button>
      <dialog
        ref={dialog}
        aria-labelledby={label}
        className="sv-report-dialog rounded-2xl border border-brand-100 bg-white p-5 text-brand-900 shadow-xl backdrop:bg-brand-900/30"
      >
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            submit.mutate();
          }}
        >
          <h2 id={label} className="text-lg font-semibold">
            {kind === 'message'
              ? 'Reportar este mensaje'
              : 'Reportar información de la sede'}
          </h2>
          <p className="text-sm">
            {kind === 'message'
              ? 'La revisión autoriza únicamente el mensaje elegido y, si existe, su archivo. No abre el resto de tu conversación.'
              : 'Incluye el dato incorrecto y lo que debería revisarse. No incluyas contraseñas ni información de pacientes.'}
          </p>
          {!submit.isSuccess && (
            <>
              <label className="block">
                Motivo del reporte
                <select
                  className={fieldClass}
                  value={category}
                  onChange={(e) =>
                    setCategory(e.target.value as keyof typeof reportCategories)
                  }
                  disabled={submit.isPending}
                >
                  {Object.entries(reportCategories).map(([value, text]) => (
                    <option key={value} value={value}>
                      {text}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                Describe lo ocurrido
                <textarea
                  className={fieldClass}
                  minLength={10}
                  maxLength={1000}
                  rows={4}
                  required
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  disabled={submit.isPending}
                />
              </label>
              <p className="text-xs">
                {reason.length}/1000. La evidencia de revisión se retira al
                resolver; se conserva la trazabilidad de la decisión.
              </p>
              <button
                className="button button-primary"
                disabled={
                  !online || submit.isPending || reason.trim().length < 10
                }
              >
                {submit.isPending ? 'Enviando reporte…' : 'Enviar reporte'}
              </button>
            </>
          )}
          {submit.isError && <Notice error>{reportError(submit.error)}</Notice>}
          {submit.isSuccess && (
            <Notice>
              Reporte recibido. Referencia: {String(submit.data)}.{' '}
              <Link className="underline" to="/reportes">
                Consultar mis reportes
              </Link>
            </Notice>
          )}
          <button
            type="button"
            className={secondaryClass}
            disabled={submit.isPending}
            onClick={() => {
              dialog.current?.close();
              setReason('');
              setOperation(crypto.randomUUID());
              submit.reset();
            }}
          >
            Cerrar
          </button>
        </form>
      </dialog>
    </>
  );
}
