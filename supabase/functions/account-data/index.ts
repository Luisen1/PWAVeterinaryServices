import { createPrivacyHandler } from './handler.ts';
Deno.serve(createPrivacyHandler((name) => Deno.env.get(name)));
