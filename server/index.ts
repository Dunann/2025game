import { createDatabase } from './database';
import { createApp } from './app';

const port = Number(process.env.PORT ?? 3001);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be between 1 and 65535.');
const db = await createDatabase();
const app = createApp(db);
const server = app.listen(port, process.env.HOST ?? '127.0.0.1', () => {
  console.log(`2025 game server listening on ${process.env.HOST ?? '127.0.0.1'}:${port} (${db.kind})`);
});
let closing = false;
async function stop() {
  if (closing) return;
  closing = true;
  server.close(async () => { await db.close(); process.exit(0); });
}
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
