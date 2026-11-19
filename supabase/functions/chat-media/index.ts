import { observedHandler } from '../_shared/observability.ts';
import { createMediaHandler } from './handler.ts';
const env = (name: string) => Deno.env.get(name);
Deno.serve(observedHandler(env, 'media', createMediaHandler(env)));
