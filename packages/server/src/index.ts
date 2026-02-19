import { createServer } from "./server";

const port = parseInt(process.env.BLKCAT_PORT ?? "3000");
const secret = process.env.BLKCAT_SECRET ?? "";
const staticDir = process.env.BLKCAT_STATIC_DIR;

if (!secret) {
  console.error("BLKCAT_SECRET is required");
  process.exit(1);
}

const server = createServer({ port, secret, staticDir });
console.log(`blkcat-monitor server listening on port ${server.port}`);
