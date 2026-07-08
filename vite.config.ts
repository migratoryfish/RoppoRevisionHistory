import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { version } from "./package.json";

export default defineConfig({
  plugins: [react()],
  base: "./",
  // アプリのバージョン（package.json の version が単一の情報源）
  define: { __APP_VERSION__: JSON.stringify(version) },
});
