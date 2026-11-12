import { defineConfig } from "vite";
import basicSsl from "@vitejs/plugin-basic-ssl";

// basicSsl serves the dev site over HTTPS with a self-signed certificate.
// Phones only allow microphone access on HTTPS pages (or on localhost),
// so this is what lets us test the mic on a phone over the home network.
export default defineConfig({
  plugins: [basicSsl()],
  server: { host: true },
});
