import app from "./app";
import { ensureSchema } from "./lib/ensure-schema";
import { logger } from "./lib/logger";

// Refuse to boot in production without a real session signing secret.
// Guest / app HMAC tokens must not fall back to the shared dev default.
if (process.env.NODE_ENV === "production" && !process.env.SESSION_SECRET?.trim()) {
  logger.error("SESSION_SECRET is required in production — refusing to start");
  process.exit(1);
}

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

async function main() {
  try {
    await ensureSchema();
  } catch (err) {
    logger.error({ err }, "Schema ensure failed — refusing to start");
    process.exit(1);
  }

  app.listen(port, (err) => {
    if (err) {
      logger.error({ err }, "Error listening on port");
      process.exit(1);
    }

    logger.info({ port }, "Server listening");
  });
}

void main();
