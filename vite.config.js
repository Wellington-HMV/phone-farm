import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const BACKEND = process.env.BACKEND || "http://localhost:4000";

// `vite build --mode web` → bundle da casca hospedada (GitHub Pages em /phone-farm/).
// Demais modos (dev/build) → base "/", mesma-origem (desktop e `npm start`).
export default defineConfig(({ mode }) => ({
  base: mode === "web" ? "/phone-farm/" : "/",
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
    proxy: {
      "/api": { target: BACKEND, changeOrigin: true },
      "/ws": { target: BACKEND, ws: true },
    },
  },
}));
