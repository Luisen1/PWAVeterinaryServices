import { Link, useNavigate, useSearchParams } from 'react-router';
import { useZodForm } from '@/lib/forms';
import { supabase } from '@/lib/supabase';
import { useOnline } from '@/pwa/useOnline';
import { loginSchema } from '@/features/auth/schemas';
import { loginAccount } from '@/features/auth/api';
import { refreshAuthSession } from '@/features/auth/session-store';
import { authErrorMessage } from '@/features/auth/errors';
import { AuthField } from '@/features/auth/components/AuthField';
import {
  AuthFrame,
  authLinkClass,
  submitClass,
} from '@/features/auth/components/AuthFrame';

export function LoginPage() {
  const online = useOnline();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const form = useZodForm(loginSchema, {
    defaultValues: { email: '', password: '' },
  });
  const { errors, isSubmitting } = form.formState;
  const submit = form.handleSubmit(async (values) => {
    try {
      await loginAccount(values.email, values.password);
      await refreshAuthSession();
      form.reset();
      await navigate('/cuenta', { replace: true });
    } catch (error) {
      form.setError('root', { message: authErrorMessage(error) });
    }
  });
  return (
    <AuthFrame
      title="Iniciar sesión"
      description="Accede con el correo y la contraseña de tu cuenta."
    >
      {params.get('aviso') === 'enlace-invalido' && (
        <p
          role="alert"
          className="mb-5 rounded-xl bg-amber-50 p-3 text-sm text-amber-900"
        >
          El enlace venció, ya fue utilizado o se abrió desde otro navegador.
          Solicita uno nuevo.
        </p>
      )}
      {params.get('aviso') === 'clave-actualizada' && (
        <p
          role="status"
          className="mb-5 rounded-xl bg-brand-50 p-3 text-sm text-brand-900"
        >
          Tu contraseña se actualizó. Inicia sesión con la nueva contraseña.
        </p>
      )}
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
          autoComplete="current-password"
          required
          error={errors.password?.message}
          {...form.register('password')}
        />
        <Link
          to="/recuperar-acceso"
          className={`inline-block text-sm ${authLinkClass}`}
        >
          Olvidé mi contraseña
        </Link>
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
          {isSubmitting ? 'Iniciando sesión…' : 'Iniciar sesión'}
        </button>
        <p className="text-center text-sm text-stone-600">
          ¿Es tu primera visita?{' '}
          <Link to="/registro" className={authLinkClass}>
            Crear cuenta
          </Link>
        </p>
      </form>
    </AuthFrame>
  );
}
