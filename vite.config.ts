import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { createDevAutoAuthPlugin } from "./devAutoAuth.ts";

const runServerUrl = process.env.VITE_CODEXREMOTE_RUN_SERVER_URL ?? "http://127.0.0.1:18875";

export default defineConfig({
  plugins: [react(), createDevAutoAuthPlugin(process.env.VITE_CODEXREMOTE_AUTO_AUTH === "1")],
  server: {
    host: "127.0.0.1",
    port: 4173,
    proxy: {
      "/v1": { target: runServerUrl, changeOrigin: true },
    },
  },
  preview: {
    host: "127.0.0.1",
    port: 4173,
    proxy: {
      "/v1": { target: runServerUrl, changeOrigin: true },
    },
  },
});
