import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const viteEntry = fileURLToPath(new URL('../node_modules/vite/bin/vite.js', import.meta.url));
const api = spawn(process.execPath, [
  '--env-file-if-exists=.env', '--import', 'tsx', 'server/index.ts',
], { cwd: root, stdio: ['inherit', 'inherit', 'inherit', 'ipc'] });
const web = spawn(process.execPath, [
  viteEntry, '--host', '127.0.0.1', '--port', '5173', '--strictPort',
], { cwd: root, stdio: 'inherit' });

let stopping = false;
let failed = false;
let apiEnded = false;
let webEnded = false;

function watch(child, name, markEnded) {
  return new Promise(resolve => {
    let settled = false;
    function finish(code, signal, error) {
      if (settled) return;
      settled = true;
      markEnded();
      if (error) console.error(`${name} could not start:`, error.message);
      if (!stopping) {
        console.error(`${name} stopped unexpectedly (${error ? 'startup error' : signal ?? code}).`);
        failed = true;
        // Resolve before shutdown starts waiting for this child.
        resolve();
        void shutdown();
      } else {
        if (error || (code !== null && code !== 0)) failed = true;
        resolve();
      }
    }
    child.once('error', error => finish(null, null, error));
    child.once('exit', (code, signal) => finish(code, signal));
  });
}

const apiExit = watch(api, 'API', () => { apiEnded = true; });
const webExit = watch(web, 'Vite', () => { webEnded = true; });

async function shutdown() {
  if (stopping) return;
  stopping = true;
  console.log('Stopping the API and closing its database…');
  const warning = setTimeout(() => {
    failed = true;
    console.error('API shutdown is taking longer than 15 seconds. Waiting to preserve database data; the API will not be force killed.');
  }, 15_000);
  warning.unref();
  if (!apiEnded) {
    if (api.connected) {
      api.send({ type: 'shutdown' }, error => {
        if (!error || apiEnded) return;
        console.error('Could not send the API shutdown request; disconnecting its IPC channel.', error.message);
        // The API also closes its database on IPC disconnect.
        if (api.connected) api.disconnect();
      });
    } else {
      console.error('The API IPC channel is unavailable. Waiting for the API to finish without force killing it.');
    }
  }
  await apiExit;
  clearTimeout(warning);
  // Vite has no database. Stop it only after the API has actually exited.
  if (!webEnded) web.kill('SIGTERM');
  await webExit;
  process.exitCode = failed ? 1 : 0;
  if (process.connected) process.disconnect();
}

process.on('SIGINT', () => { void shutdown(); });
process.on('SIGTERM', () => { void shutdown(); });
process.on('message', message => {
  if (message?.type === 'shutdown') void shutdown();
});
if (process.connected) process.on('disconnect', () => { void shutdown(); });

console.log('Frontend HMR is enabled. Restart npm run dev after backend changes.');
