import { write } from "bun";

import { buildApp } from "../src/app";

const app = await buildApp({ readinessProbe: { check: async () => undefined } });
await app.ready();

await write("../../docs/openapi.json", `${JSON.stringify(app.swagger(), null, 2)}\n`);
await app.close();
