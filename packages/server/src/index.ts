import { createServer } from "./server";

const port = parseInt(process.env.BLKCAT_PORT ?? "3000");
const staticDir = process.env.BLKCAT_STATIC_DIR;

const server = createServer({ port, staticDir });
console.log(`blkcat-monitor server listening on port ${server.port}`);
