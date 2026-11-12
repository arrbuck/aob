import { defineConfig } from "vite";
import basicSsl from "@vitejs/plugin-basic-ssl";
import { cloudflare } from "@cloudflare/vite-plugin";

// basicSsl serves the dev site over HTTPS with a self-signed certificate.
// Phones only allow microphone access on HTTPS pages (or on localhost),
// so this is what lets us test the mic on a phone over the home network.
//
// cloudflare() runs the Worker (worker/index.ts, per wrangler.jsonc) inside
// the same dev server, so the page and /api/... share one address.
export default defineConfig({
  plugins: [basicSsl(), cloudflare()],
  server: { host: true },
});
