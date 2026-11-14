import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';

const environmentSchema = z.object({
  url: z.url(),
  key: z.string().min(1),
});

const url = import.meta.env.VITE_SUPABASE_URL?.trim();
const key = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();
const environment = environmentSchema.safeParse({ url, key });

if ((url || key) && !environment.success) {
  throw new Error(
    'Configura VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY con valores públicos válidos.',
  );
}

// El shell funciona sin credenciales. Los futuros consumidores deben comprobar null.
export const supabase = environment.success
  ? createClient(environment.data.url, environment.data.key, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    })
  : null;
