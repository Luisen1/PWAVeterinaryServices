import { z } from 'zod';

export const PRIVACY_POLICY_VERSION = '2026-11-14';

const email = z
  .string()
  .trim()
  .max(254, 'El correo es demasiado largo.')
  .pipe(z.email('Escribe un correo electrónico válido.'));
const password = z
  .string()
  .min(8, 'Usa al menos 8 caracteres.')
  .max(72, 'Usa como máximo 72 caracteres.');

export const loginSchema = z.object({
  email,
  password: z.string().min(1, 'Escribe tu contraseña.'),
});

export const registrationSchema = z
  .object({
    email,
    password,
    confirmPassword: z.string(),
    privacyAccepted: z
      .boolean()
      .refine(
        (value) => value,
        'Lee y acepta el aviso de privacidad para continuar.',
      ),
  })
  .refine((values) => values.password === values.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Las contraseñas deben coincidir.',
  });

export const recoverySchema = z.object({ email });

export const newPasswordSchema = z
  .object({ password, confirmPassword: z.string() })
  .refine((values) => values.password === values.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Las contraseñas deben coincidir.',
  });
