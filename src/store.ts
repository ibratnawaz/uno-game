import { create } from 'zustand';
import type { RoomView } from '../shared/room';

export type Screen = 'home' | 'bots' | 'friends';
export type Conn = 'idle' | 'connecting' | 'online' | 'reconnecting' | 'failed';

export interface Toast {
  id: number;
  text: string;
  kind: 'info' | 'error';
}

interface AppState {
  screen: Screen;
  friendsTab: 'create' | 'join';
  prefillCode: string;
  view: RoomView | null;
  mode: 'online' | 'local' | null;
  conn: Conn;
  /** True while we are trying to restore a saved session (shows a splash instead of Home). */
  restoring: boolean;
  toast: Toast | null;
  nav: (screen: Screen, tab?: 'create' | 'join', code?: string) => void;
  setView: (view: RoomView | null, mode?: 'online' | 'local' | null) => void;
  setConn: (conn: Conn) => void;
  setRestoring: (b: boolean) => void;
  say: (text: string, kind?: Toast['kind']) => void;
}

let toastId = 0;

export const useStore = create<AppState>((set) => ({
  screen: 'home',
  friendsTab: 'create',
  prefillCode: '',
  view: null,
  mode: null,
  conn: 'idle',
  restoring: true,
  toast: null,
  nav: (screen, tab, code) =>
    set((s) => ({ screen, friendsTab: tab ?? s.friendsTab, prefillCode: code ?? s.prefillCode })),
  setView: (view, mode) =>
    set((s) => ({
      view,
      mode: mode === undefined ? s.mode : mode,
      ...(view ? {} : { screen: 'home' as Screen }),
    })),
  setConn: (conn) => set({ conn }),
  setRestoring: (restoring) => set({ restoring }),
  say: (text, kind = 'info') => {
    const id = ++toastId;
    set({ toast: { id, text, kind } });
    setTimeout(() => set((s) => (s.toast?.id === id ? { toast: null } : {})), 3600);
  },
}));
