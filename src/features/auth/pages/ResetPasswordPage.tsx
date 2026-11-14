import { Link, useNavigate } from 'react-router';
import { useZodForm } from '@/lib/forms';
import { useOnline } from '@/pwa/useOnline';
import { useAuth } from '@/features/auth/useAuth';
import { authClient, withAuthOperation } from '@/features/auth/api';
import { newPasswordSchema } from '@/features/auth/schemas';
import {
  clearRecoveryAccess,
  hasRecoveryAccess,
} from '@/features/auth/recovery-access';
import { authErrorMessage } from '@/features/auth/errors';
import { AuthField } from '@/features/auth/components/AuthField';
import {
  AuthFrame,
  authLinkClass,
  submitClass,
} from '@/features/auth/components/AuthFrame';

export function ResetPasswordPage() {
  const { status, user } = useAuth();
  const online = useOnline();
  const navigate = useNavigate();
  const form = useZodForm(newPasswordSchema, {
    defaultValues: { password: '', confirmPassword: '' },
  });
  const { errors, isSubmitting } = form.formState;
  const allowed = !!user && hasRecoveryAccess(user.id);
  const submit = form.handleSubmit(async (values) => {
    if (!user || !hasRecoveryAccess(user.id)) {
      form.setError('root', {
        message: 'El permiso de recuperación venció. Solicita un nuevo enlace.',
      });
      return;
    }
    try {
      await withAuthOperation(async () => {
        const { error } = await authClient().auth.updateUser({
          password: values.password,
        });
        if (error) throw error;
      });
      clearRecoveryAccess();
      form.reset();
      await navigate('/cuenta?aviso=clave-actualizada', { replace: true });
    } catch (error) {
      form.setError('root', { message: authErrorMessage(error) });
    }
  });
  return (
    <AuthFrame
      title="Nueva contraseña"
      description="Establece una contraseña para recuperar el acceso a tu cuenta."
    >
      {status === 'loading' ? (
        <p role="status" className="text-sm text-stone-600">
          Comprobando sesión…
        </p>
      ) : allowed ? (
        <form
          noValidate
          onSubmit={(event) => void submit(event)}
          className="space-y-5"
        >
          <AuthField
            label="Nueva contraseña"
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
            label="Confirmar nueva contraseña"
            type="password"
            autoComplete="new-password"
            required
            error={errors.confirmPassword?.message}
            {...form.register('confirmPassword')}
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
            disabled={isSubmitting || !online}
            className={submitClass}
          >
            {isSubmitting
              ? 'Guardando contraseña…'
              : 'Guardar nueva contraseña'}
          </button>
        </form>
      ) : (
        <div className="space-y-4 text-sm leading-6">
          <p role="alert" className="rounded-xl bg-amber-50 p-4 text-amber-900">
            Necesitas un enlace de recuperación válido para cambiar la
            contraseña. Solicita uno nuevo y ábrelo en este navegador.
          </p>
          <Link to="/recuperar-acceso" className={authLinkClass}>
            Solicitar un nuevo enlace
          </Link>
        </div>
      )}
    </AuthFrame>
  );
}
