import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startApp } from './app';
import { FileStore, PostgresStore } from './store';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.PORT ?? 8787);
const store = process.env.DATABASE_URL
  ? new PostgresStore(process.env.DATABASE_URL)
  : new FileStore(path.resolve(root, process.env.DATA_DIR ?? 'data'));

const app = await startApp({
  port,
  store,
  staticDir: path.join(root, 'dist'),
  graceMs: Number(process.env.DISCONNECT_GRACE_SECONDS ?? 6) * 1000,
  allowedOrigins: (process.env.ALLOWED_ORIGINS ?? '').split(',').map((s) => s.trim()),
});
console.log(
  `[server] listening on :${app.port} (storage: ${process.env.DATABASE_URL ? 'postgres' : 'files'})`,
);

const stop = async () => {
  await app.close();
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
