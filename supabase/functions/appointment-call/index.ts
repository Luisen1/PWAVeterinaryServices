import { observedHandler } from '../_shared/observability.ts';
import { createCallHandler } from './handler.ts';
const env = (name: string) => Deno.env.get(name);
Deno.serve(observedHandler(env, 'call', createCallHandler(env)));
