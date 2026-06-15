import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    minify: false,
    sourcemap: false,
    chunkSizeWarningLimit: 1800,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return;
          if (id.includes("@dynamic-labs") || id.includes("@turnkey")) return "wallet";
          if (id.includes("wagmi") || id.includes("viem") || id.includes("@tanstack")) return "web3";
          if (id.includes("@radix-ui") || id.includes("lucide-react")) return "ui";
          return "vendor";
        },
      },
    },
  },
}));
