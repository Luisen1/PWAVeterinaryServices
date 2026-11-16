import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { authClient } from '@/features/auth/api';
import { useOnline } from '@/pwa/useOnline';
export const policySchema = z.object({
  cancel_minutes: z.number().int(),
  reschedule_minutes: z.number().int(),
  revision: z.number().int(),
});
export function useAppointmentPolicy(establishment: string) {
  const online = useOnline();
  return useQuery({
    queryKey: ['appointment-policy', establishment],
    enabled: online && !!establishment,
    retry: false,
    queryFn: async ({ signal }) => {
      const { data, error } = await authClient()
        .from('appointment_change_policies')
        .select('cancel_minutes,reschedule_minutes,revision')
        .eq('establishment_id', establishment)
        .abortSignal(signal)
        .maybeSingle();
      if (error) throw error;
      return data
        ? policySchema.parse(data)
        : { cancel_minutes: 0, reschedule_minutes: 0, revision: 0 };
    },
  });
}
