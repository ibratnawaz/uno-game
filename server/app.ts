/** HTTP + WebSocket wiring around RoomManager. Exported as a factory so tests can boot it. */
import { createServer, type IncomingMessage, type Server } from 'node:http';
import { existsSync, createReadStream, statSync } from 'node:fs';
import path from 'node:path';
import { WebSocketServer, type WebSocket } from 'ws';
import type { ClientMsg, ServerMsg } from '../shared/protocol';
import { RoomManager, type Conn, type ManagerOptions } from './manager';

export interface AppOptions extends ManagerOptions {
  port?: number;
  staticDir?: string;
  allowedOrigins?: string[];
  /** Drop a socket silent for this long (ms). */
  idleTimeoutMs?: number;
}

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.webmanifest': 'application/manifest+json',
};

export interface RunningApp {
  server: Server;
  manager: RoomManager;
  port: number;
  close(): Promise<void>;
}

export async function startApp(opts: AppOptions): Promise<RunningApp> {
  const manager = new RoomManager(opts);
  const restored = await manager.load();
  if (restored) console.log(`[server] restored ${restored} room(s) from storage`);
  manager.startSweeper();

  const staticDir = opts.staticDir;
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    if (url.pathname === '/healthz') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return void res.end(JSON.stringify({ ok: true, rooms: manager.rooms.size }));
    }
    if (!staticDir || !existsSync(staticDir)) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      return void res.end('ChromaRush API server. Build the frontend with `npm run build`.');
    }
    let file = path.join(staticDir, path.normalize(decodeURIComponent(url.pathname)));
    if (!file.startsWith(staticDir)) {
      res.writeHead(403);
      return void res.end();
    }
    if (!existsSync(file) || statSync(file).isDirectory())
      file = path.join(staticDir, 'index.html');
    const ext = path.extname(file);
    const immutable = file.includes(`${path.sep}assets${path.sep}`);
    res.writeHead(200, {
      'Content-Type': MIME[ext] ?? 'application/octet-stream',
      'Cache-Control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache',
    });
    createReadStream(file).pipe(res);
  });

  const wss = new WebSocketServer({
    server,
    path: '/ws',
    maxPayload: 16 * 1024,
    verifyClient: ({ origin }: { origin: string }) => {
      const allowed = opts.allowedOrigins?.filter(Boolean);
      return !allowed?.length || !origin || allowed.includes(origin);
    },
  });

  const idleTimeout = opts.idleTimeoutMs ?? 45_000;
  const alive = new WeakMap<WebSocket, number>();

  wss.on('connection', (ws: WebSocket, _req: IncomingMessage) => {
    alive.set(ws, Date.now());
    let tokens = 40; // simple token bucket against message floods
    const refill = setInterval(() => (tokens = Math.min(40, tokens + 15)), 1000);
    const conn: Conn = {
      send: (m: ServerMsg) => {
        if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(m));
      },
      close: () => ws.close(),
    };
    ws.on('pong', () => alive.set(ws, Date.now()));
    ws.on('message', (data) => {
      alive.set(ws, Date.now());
      if (--tokens < 0)
        return conn.send({ t: 'error', code: 'rate_limited', message: 'Slow down.' });
      let msg: ClientMsg;
      try {
        msg = JSON.parse(data.toString());
      } catch {
        return conn.send({ t: 'error', code: 'bad_request', message: 'Invalid JSON.' });
      }
      manager.handle(conn, msg);
    });
    ws.on('close', () => {
      clearInterval(refill);
      manager.onClose(conn);
    });
    ws.on('error', () => ws.terminate());
  });

  // Protocol-level heartbeat: browsers answer ping frames automatically.
  const heartbeat = setInterval(
    () => {
      const now = Date.now();
      for (const ws of wss.clients) {
        if (now - (alive.get(ws) ?? now) > idleTimeout) ws.terminate();
        else ws.ping();
      }
    },
    Math.min(15_000, Math.floor(idleTimeout / 3)),
  );
  heartbeat.unref();

  await new Promise<void>((resolve) => server.listen(opts.port ?? 0, resolve));
  const port = (server.address() as { port: number }).port;

  return {
    server,
    manager,
    port,
    async close() {
      clearInterval(heartbeat);
      for (const ws of wss.clients) ws.terminate();
      await new Promise<void>((r) => wss.close(() => r()));
      await new Promise<void>((r) => server.close(() => r()));
      await manager.shutdown();
    },
  };
}
