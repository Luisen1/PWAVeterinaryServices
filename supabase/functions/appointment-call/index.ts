import { createCallHandler } from './handler.ts';
Deno.serve(createCallHandler((name) => Deno.env.get(name)));
