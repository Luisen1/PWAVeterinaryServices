import { useForm, type FieldValues, type UseFormProps } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { z } from 'zod';

export function useZodForm<
  Input extends FieldValues,
  Output extends FieldValues,
>(
  schema: z.ZodType<Output, Input>,
  options?: Omit<UseFormProps<Input, unknown, Output>, 'resolver'>,
) {
  return useForm<Input, unknown, Output>({
    mode: 'onBlur',
    reValidateMode: 'onChange',
    ...options,
    resolver: zodResolver(schema),
  });
}
