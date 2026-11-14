import { useState } from 'react';
import { Link } from 'react-router';
import { useZodForm } from '@/lib/forms';
import { supabase } from '@/lib/supabase';
import { useOnline } from '@/pwa/useOnline';
import { recoverySchema } from '@/features/auth/schemas';
import { requestPasswordRecovery } from '@/features/auth/api';
import { authErrorMessage } from '@/features/auth/errors';
import { AuthField } from '@/features/auth/components/AuthField';
import {
  AuthFrame,
  authLinkClass,
  submitClass,
} from '@/features/auth/components/AuthFrame';

export function RecoveryPage() {
  const online = useOnline();
  const [sent, setSent] = useState(false);
  const form = useZodForm(recoverySchema, { defaultValues: { email: '' } });
  const { errors, isSubmitting } = form.formState;
  const submit = form.handleSubmit(async (values) => {
    try {
      await requestPasswordRecovery(values.email);
      setSent(true);
      form.reset();
    } catch (error) {
      form.setError('root', { message: authErrorMessage(error) });
    }
  });
  return (
    <AuthFrame
      title="Recuperar acceso"
      description="Solicita un enlace para establecer una nueva contraseña."
    >
      {sent ? (
        <div role="status" className="space-y-4 text-sm leading-6">
          <p className="rounded-xl bg-brand-50 p-4 text-brand-900">
            Si existe una cuenta asociada a ese correo, recibirás un enlace
            temporal para recuperar el acceso.
          </p>
          <p className="text-stone-600">
            Abre el enlace en este mismo navegador y revisa el correo no
            deseado.
          </p>
        </div>
      ) : (
        <form
          noValidate
          onSubmit={(event) => void submit(event)}
          className="space-y-5"
        >
          <AuthField
            label="Correo electrónico"
            type="email"
            autoComplete="email"
            inputMode="email"
            required
            error={errors.email?.message}
            {...form.register('email')}
          />
          {errors.root?.message && (
            <p
              role="alert"
              className="rounded-xl bg-red-50 p-3 text-sm text-red-800"
            >
              {errors.root.message}
            </p>
          )}
          <button
            type="submit"
            disabled={isSubmitting || !online || !supabase}
            className={submitClass}
          >
            {isSubmitting
              ? 'Solicitando enlace…'
              : 'Enviar enlace de recuperación'}
          </button>
        </form>
      )}
      <Link
        to="/acceso"
        className={`mt-5 inline-block text-sm ${authLinkClass}`}
      >
        Volver a iniciar sesión
      </Link>
    </AuthFrame>
  );
}
