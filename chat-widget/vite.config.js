// chat-widget/vite.config.js
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    lib: {
      entry: "src/widget.tsx",
      name: "ChatWidget",
      formats: ["iife"],
      fileName: () => "chat-widget.js",
    },
  },
});
