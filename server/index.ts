import { createDatabase } from './database';
import { createApp } from './app';

const port = Number(process.env.PORT ?? 3001);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be between 1 and 65535.');
let shutdownRequested = false;
let closeServer: (() => Promise<void>) | undefined;
function requestStop() {
  shutdownRequested = true;
  if (closeServer) void closeServer();
}
process.on('SIGINT', requestStop);
process.on('SIGTERM', requestStop);
process.on('message', message => {
  if (typeof message === 'object' && message !== null && 'type' in message && message.type === 'shutdown') requestStop();
});
if (process.connected) process.on('disconnect', requestStop);
const db = await createDatabase().catch(error => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
if (shutdownRequested) { await db.close(); process.exit(0); }
const app = createApp(db);
const server = app.listen(port, process.env.HOST ?? '127.0.0.1', () => {
  console.log(`2025 game server listening on ${process.env.HOST ?? '127.0.0.1'}:${port} (${db.kind})`);
});
let closing = false;
async function stop() {
  if (closing) return;
  closing = true;
  try {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    await db.close();
    process.exit(0);
  } catch (error) {
    console.error('Database shutdown failed:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
closeServer = stop;
server.on('error', async error => {
  console.error(error.message);
  await db.close();
  process.exit(1);
});
