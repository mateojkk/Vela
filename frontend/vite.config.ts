import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

/**
 * Injects a browser-native importmap that maps @mysten/* packages to esm.sh.
 * This allows the app to use Sui/zkLogin without needing them in node_modules.
 */
function importMapPlugin(): Plugin {
  const map = JSON.stringify(
    {
      imports: {
        // Pin to the version installed locally so runtime matches TypeScript types.
        // subpath imports like @mysten/sui/keypairs/ed25519 → trailing slash
        "@mysten/sui": "https://esm.sh/@mysten/sui@2.18.0",
        "@mysten/sui/": "https://esm.sh/@mysten/sui@2.18.0/",
      },
    },
    null,
    2
  );
  return {
    name: "vela-import-map",
    transformIndexHtml(html) {
      // Inject importmap BEFORE any other scripts so the browser honours it
      return html.replace(
        "<head>",
        `<head>\n    <script type="importmap">${map}</script>`
      );
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), importMapPlugin()],
  envDir: "..",
  server: {
    proxy: {
      "/api": "http://localhost:3000",
    },
  },
  build: {
    rollupOptions: {
      // Don't bundle @mysten/* — leave them as external ESM imports
      // resolved at runtime by the importmap above.
      external: (id: string) => id.startsWith("@mysten/"),
    },
  },
});
