import { create } from "zustand";

/**
 * Live-update client (brief §2.2). Holds a WebSocket to /api/live and bumps
 * `seq` whenever the server reports workspace changes, with the changed paths
 * of the latest batch. Components react by watching `seq` and checking
 * `changed`. Reconnects with backoff if the socket drops.
 */
interface LiveState {
  connected: boolean;
  seq: number;
  changed: string[];
}

export const useLive = create<LiveState>(() => ({
  connected: false,
  seq: 0,
  changed: [],
}));

let socket: WebSocket | null = null;
let retry = 0;

function connect(): void {
  if (typeof window === "undefined") return;
  const proto = window.location.protocol === "https:" ? "wss" : "ws";
  socket = new WebSocket(`${proto}://${window.location.host}/api/live`);

  socket.onopen = () => {
    retry = 0;
    useLive.setState({ connected: true });
  };
  socket.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data);
      if (msg.type === "change") {
        useLive.setState((s) => ({
          seq: s.seq + 1,
          changed: Array.isArray(msg.paths) ? msg.paths : [],
        }));
      }
    } catch {
      /* ignore malformed frames */
    }
  };
  const reconnect = () => {
    useLive.setState({ connected: false });
    socket = null;
    // Backoff, capped — the server may just be restarting in dev.
    const delay = Math.min(1000 * 2 ** retry++, 10_000);
    setTimeout(connect, delay);
  };
  socket.onclose = reconnect;
  socket.onerror = () => socket?.close();
}

/** Open the live connection once, at app start. */
export function startLive(): void {
  if (!socket) connect();
}
