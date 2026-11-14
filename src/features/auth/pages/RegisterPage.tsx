import { useState } from 'react';
import { Link } from 'react-router';
import { useZodForm } from '@/lib/forms';
import { supabase } from '@/lib/supabase';
import { useOnline } from '@/pwa/useOnline';
import { registrationSchema } from '@/features/auth/schemas';
import { registerAccount, resendConfirmation } from '@/features/auth/api';
import { authErrorMessage } from '@/features/auth/errors';
import { AuthField } from '@/features/auth/components/AuthField';
import {
  AuthFrame,
  authLinkClass,
  submitClass,
} from '@/features/auth/components/AuthFrame';

export function RegisterPage() {
  const online = useOnline();
  const [registeredEmail, setRegisteredEmail] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [resending, setResending] = useState(false);
  const form = useZodForm(registrationSchema, {
    defaultValues: {
      email: '',
      password: '',
      confirmPassword: '',
      privacyAccepted: false,
    },
  });
  const { errors, isSubmitting } = form.formState;

  const submit = form.handleSubmit(async (values) => {
    try {
      await registerAccount(values.email, values.password);
      setRegisteredEmail(values.email);
      form.reset();
    } catch (error) {
      form.setError('root', { message: authErrorMessage(error) });
    }
  });

  async function resend() {
    if (!registeredEmail) return;
    setResending(true);
    try {
      await resendConfirmation(registeredEmail);
      setMessage(
        'Si tu cuenta necesita confirmación, recibirás un nuevo enlace.',
      );
    } catch (error) {
      setMessage(authErrorMessage(error));
    } finally {
      setResending(false);
    }
  }

  return (
    <AuthFrame
      title="Crear cuenta"
      description="Regístrate con tu correo para comenzar a utilizar tu cuenta."
    >
      {registeredEmail ? (
        <div className="space-y-4">
          <div
            role="status"
            className="rounded-xl bg-brand-50 p-4 text-sm leading-6 text-brand-900"
          >
            Revisa el correo {registeredEmail}. Si el registro procede,
            recibirás un enlace para confirmar la cuenta. Si ya tienes una
            cuenta, puedes iniciar sesión o recuperar el acceso.
          </div>
          <p className="text-sm leading-6 text-stone-600">
            Abre el enlace en este mismo navegador. Comprueba también la carpeta
            de correo no deseado.
          </p>
          {message && (
            <p role="status" className="text-sm text-stone-700">
              {message}
            </p>
          )}
          <button
            type="button"
            disabled={resending || !online}
            onClick={() => void resend()}
            className={submitClass}
          >
            {resending ? 'Solicitando enlace…' : 'Reenviar confirmación'}
          </button>
          <Link
            className={`block text-center text-sm ${authLinkClass}`}
            to="/acceso"
          >
            Ir a iniciar sesión
          </Link>
          <Link
            className={`block text-center text-sm ${authLinkClass}`}
            to="/recuperar-acceso"
          >
            Recuperar acceso
          </Link>
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
          <AuthField
            label="Contraseña"
            type="password"
            autoComplete="new-password"
            required
            error={errors.password?.message}
            {...form.register('password')}
          />
          <p className="-mt-2 text-xs text-stone-600">
            Entre 8 y 72 caracteres.
          </p>
          <AuthField
            label="Confirmar contraseña"
            type="password"
            autoComplete="new-password"
            required
            error={errors.confirmPassword?.message}
            {...form.register('confirmPassword')}
          />
          <div>
            <label className="flex items-start gap-3 text-sm leading-6 text-stone-700">
              <input
                type="checkbox"
                className="mt-1 size-4 shrink-0 accent-brand-700"
                aria-invalid={!!errors.privacyAccepted}
                aria-describedby={
                  errors.privacyAccepted ? 'privacy-error' : undefined
                }
                {...form.register('privacyAccepted')}
              />
              <span>
                He leído y acepto el{' '}
                <Link
                  to="/privacidad"
                  target="_blank"
                  rel="noopener noreferrer"
                  className={authLinkClass}
                >
                  aviso de privacidad
                </Link>
                .
              </span>
            </label>
            {errors.privacyAccepted && (
              <p id="privacy-error" className="mt-2 text-sm text-red-800">
                {errors.privacyAccepted.message}
              </p>
            )}
          </div>
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
            {isSubmitting ? 'Creando cuenta…' : 'Crear cuenta'}
          </button>
          <p className="text-center text-sm text-stone-600">
            ¿Ya tienes cuenta?{' '}
            <Link to="/acceso" className={authLinkClass}>
              Iniciar sesión
            </Link>
          </p>
        </form>
      )}
    </AuthFrame>
  );
}
