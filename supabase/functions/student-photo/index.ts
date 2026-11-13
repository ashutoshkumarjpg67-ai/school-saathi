// Gateway JWT verification must be OFF for custom teacher/staff/student tokens.
// Every request is authenticated again by core + the service-only SQL broker.
import { handlePhoto } from './core.mjs';
Deno.serve((req: Request) => handlePhoto(req, {
  env: (name: string) => Deno.env.get(name),
  fetch: globalThis.fetch.bind(globalThis),
}));
