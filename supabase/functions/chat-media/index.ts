import { createMediaHandler } from './handler.ts';
Deno.serve(createMediaHandler((name) => Deno.env.get(name)));
