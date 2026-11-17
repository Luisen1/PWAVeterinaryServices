import { z } from 'zod';

export const accountTypeSchema = z.enum(['pet_owner', 'veterinary'], {
  error: 'Elige Dueño de mascota o Veterinaria.',
});
export type AccountType = z.infer<typeof accountTypeSchema>;
export const accountContextSchema = z.object({
  role: z.enum(['user', 'provider', 'admin']),
  account_type: accountTypeSchema,
  account_type_selected: z.boolean(),
  can_read_appointments: z.boolean(),
  can_message_team: z.boolean(),
});
export type AccountContext = z.infer<typeof accountContextSchema>;
export const accountTypeLabels: Record<AccountType, string> = {
  pet_owner: 'Dueño de mascota',
  veterinary: 'Veterinaria',
};
export function canUseArea(
  context: AccountContext,
  area: AccountType | 'admin',
) {
  if (area === 'admin') return context.role === 'admin';
  return (
    context.role !== 'admin' &&
    context.account_type_selected &&
    context.account_type === area
  );
}
