import { createOperationsHandler } from './handler.ts';
import { observedHandler } from '../_shared/observability.ts';
const env = (name: string) => Deno.env.get(name);
Deno.serve(observedHandler(env, 'api', createOperationsHandler(env)));
