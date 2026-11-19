import { observedHandler } from '../_shared/observability.ts';
import { createPrivacyHandler } from './handler.ts';
const env = (name: string) => Deno.env.get(name);
Deno.serve(observedHandler(env, 'api', createPrivacyHandler(env)));
