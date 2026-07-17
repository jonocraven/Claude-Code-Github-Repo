import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The web app never talks to the workspace directly — everything goes
// through the Node server, so /api is proxied to it in dev.
export default defineConfig({
  plugins: [react()],
  // react-draggable (via react-rnd) reads process.env.NODE_ENV at runtime;
  // Vite doesn't provide a process shim, so define it away.
  define: { "process.env": {} },
  server: {
    host: "127.0.0.1",
    port: 5180,
    strictPort: false,
    proxy: {
      "/api": {
        target: `http://127.0.0.1:${process.env.PORT ?? 4400}`,
        changeOrigin: true,
      },
    },
  },
});
