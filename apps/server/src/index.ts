import { createPartymodeServer } from "./server.js";

const port = Number(process.env.PORT ?? 8787);
const server = createPartymodeServer();

await server.listen(port);
console.log(`partymode server listening on http://localhost:${port}`);

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    server
      .close()
      .then(() => process.exit(0))
      .catch((error) => {
        console.error(error);
        process.exit(1);
      });
  });
}
