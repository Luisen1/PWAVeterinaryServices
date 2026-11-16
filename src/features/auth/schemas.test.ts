import { expect, it } from 'vitest';
import {
  loginSchema,
  newPasswordSchema,
  registrationSchema,
} from '@/features/auth/schemas';

it('exige correo válido, confirmación de contraseña y aceptación del aviso', () => {
  expect(
    registrationSchema.safeParse({
      email: 'incorrecto',
      password: '123',
      confirmPassword: 'otra',
      privacyAccepted: false,
    }).success,
  ).toBe(false);
  const result = registrationSchema.safeParse({
    accountType: 'pet_owner',
    email: ' correo@example.com ',
    password: 'UnaClave123!',
    confirmPassword: 'UnaClave123!',
    privacyAccepted: true,
  });
  expect(result.success).toBe(true);
  if (result.success) expect(result.data.email).toBe('correo@example.com');
});

it('preserva los espacios de la contraseña y comprueba su confirmación', () => {
  expect(
    loginSchema.parse({
      email: 'correo@example.com',
      password: ' clave con espacios ',
    }).password,
  ).toBe(' clave con espacios ');
  expect(
    newPasswordSchema.safeParse({
      password: 'UnaClave123!',
      confirmPassword: 'OtraClave123!',
    }).success,
  ).toBe(false);
});

it('exige elegir un tipo de cuenta y rechaza tipos administrativos', () => {
  const values = {
    email: 'persona@example.test',
    password: 'UnaClave123!',
    confirmPassword: 'UnaClave123!',
    privacyAccepted: true,
  };
  expect(registrationSchema.safeParse(values).success).toBe(false);
  expect(
    registrationSchema.safeParse({ ...values, accountType: 'admin' }).success,
  ).toBe(false);
  expect(
    registrationSchema.safeParse({ ...values, accountType: 'veterinary' })
      .success,
  ).toBe(true);
});
