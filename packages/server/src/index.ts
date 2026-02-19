import { createServer } from "./server";

const port = parseInt(process.env.BLKCAT_PORT ?? "3000");
const hostname = process.env.BLKCAT_HOST;
const staticDir = process.env.BLKCAT_STATIC_DIR;

const server = createServer({ port, hostname, staticDir });
console.log(`blkcat-monitor server listening on ${hostname ?? "0.0.0.0"}:${server.port}`);
