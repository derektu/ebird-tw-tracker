import path from "node:path";
import { fileURLToPath } from "node:url";
import { createApplication } from "./server/application.mjs";

const root = path.dirname(fileURLToPath(import.meta.url));
const application = await createApplication({
  root,
  port: Number.parseInt(process.env.PORT ?? "7079", 10),
  isProduction: process.env.NODE_ENV === "production",
});
const address = await application.listen();
console.log(`eBird tracker listening on ${address.url}`);

let closing = false;
async function shutdown() {
  if (closing) return;
  closing = true;
  try {
    await application.close();
    process.exitCode = 0;
  } catch (error) {
    console.error("Failed to stop eBird tracker:", error);
    process.exitCode = 1;
  }
}

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
