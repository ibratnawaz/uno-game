/** Wire protocol between browser and server (JSON over WebSocket). */
import type { RoomView } from './room';
import type { GameAction } from './types';

export type ClientMsg =
  | { t: 'create'; name: string; avatar: number }
  | { t: 'join'; code: string; name: string; avatar: number }
  | { t: 'resume'; code: string; token: string }
  | { t: 'rules'; rules: unknown }
  | { t: 'ready'; ready: boolean }
  | { t: 'start' }
  | { t: 'act'; id: string; v?: number; action: GameAction }
  | { t: 'remove'; target: string }
  | { t: 'leave' }
  | { t: 'lobby' }
  | { t: 'ping' };

export type ServerMsg =
  | { t: 'welcome'; code: string; playerId: string; token: string }
  | { t: 'state'; view: RoomView }
  | { t: 'ack'; id: string; ok: boolean; error?: { code: string; message: string } }
  /** `fatal` means the stored session is unusable and should be forgotten by the client. */
  | { t: 'error'; code: string; message: string; fatal?: boolean }
  | { t: 'left'; reason: 'removed' | 'left' }
  | { t: 'pong' };

export const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const ROOM_CODE_LENGTH = 6;
export const normalizeCode = (s: string) =>
  s
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, ROOM_CODE_LENGTH);
