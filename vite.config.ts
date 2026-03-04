import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "fast-equals": path.resolve(import.meta.dirname, "node_modules", "fast-equals", "dist", "cjs", "index.cjs"),
      "pako": path.resolve(import.meta.dirname, "node_modules", "pako", "dist", "pako.js"),
    },
  },
  optimizeDeps: {
    include: ["pako"],
  },
  css: {
    postcss: {
      plugins: [],
    },
  },
  esbuild: {
    drop: process.env.NODE_ENV === "production" ? ["debugger"] : [],
    pure: process.env.NODE_ENV === "production" ? ["console.log", "console.debug"] : [],
  },
  root: path.resolve(import.meta.dirname, "client"),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
    minify: 'esbuild',
    sourcemap: false,
    chunkSizeWarningLimit: 1500,
    target: 'es2020',
    cssMinify: true,
    commonjsOptions: {
      include: [/pako/, /node_modules/],
    },
    rollupOptions: {
      output: {
        manualChunks: {
          // Core vendor libraries
          'vendor-react': ['react', 'react-dom', 'wouter'],
          'vendor-query': ['@tanstack/react-query'],
          // Heavy libraries split separately
          'vendor-xlsx': ['xlsx'],
          'vendor-pdf': ['jspdf', 'html2canvas'],
          'vendor-pdfjs': ['pdfjs-dist'],
          'vendor-charts': ['recharts'],
          // Utility libraries
          'vendor-date': ['date-fns'],
          'vendor-icons': ['lucide-react'],
          // UI components
          'vendor-ui': ['@radix-ui/react-dialog', '@radix-ui/react-dropdown-menu', '@radix-ui/react-tabs', '@radix-ui/react-accordion', '@radix-ui/react-select'],
          // Framer motion separate chunk
          'vendor-motion': ['framer-motion'],
        },
      },
    },
  },
  server: {
    host: "0.0.0.0",
    allowedHosts: true,
    hmr: false,
    // When running the client dev server directly (`npm run dev:client`),
    // proxy API + WS calls to the Express server on port 5000.
    proxy: {
      "/api": {
        target: "http://localhost:5000",
        changeOrigin: true,
      },
      "/ws": {
        target: "ws://localhost:5000",
        ws: true,
      },
    },
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
  },
});
