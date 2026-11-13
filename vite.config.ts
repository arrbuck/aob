import { appendFile, mkdir } from "node:fs/promises";
import { defineConfig, type Plugin } from "vite";
import basicSsl from "@vitejs/plugin-basic-ssl";
import { cloudflare } from "@cloudflare/vite-plugin";

// Dev-only: lets the voice test page (e.g. on a phone) send its results
// (numbers only, no audio) to a git-ignored file on this laptop:
// spike-results/results.jsonl. Exists only while `npm run dev` runs; never deployed.
function spikeResults(): Plugin {
  const MAX_BYTES = 256 * 1024;
  return {
    name: "aob-spike-results",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use("/__spike/results", (req, res) => {
        if (req.method !== "POST") {
          res.statusCode = 405;
          res.end();
          return;
        }
        let body = "";
        let tooBig = false;
        req.on("data", (chunk: Buffer) => {
          body += chunk.toString("utf8");
          if (body.length > MAX_BYTES) tooBig = true;
        });
        req.on("end", () => {
          void (async () => {
            try {
              if (tooBig) throw new Error("too big");
              const parsed: unknown = JSON.parse(body);
              await mkdir("spike-results", { recursive: true });
              const line = JSON.stringify({ receivedAt: new Date().toISOString(), ...(parsed as object) });
              await appendFile("spike-results/results.jsonl", line + "\n", "utf8");
              res.statusCode = 204;
            } catch {
              res.statusCode = 400;
            }
            res.end();
          })();
        });
      });
    },
  };
}

// basicSsl serves the dev site over HTTPS with a self-signed certificate.
// Phones only allow microphone access on HTTPS pages (or on localhost),
// so this is what lets us test the mic on a phone over the home network.
//
// cloudflare() runs the Worker (worker/index.ts, per wrangler.jsonc) inside
// the same dev server, so the page and /api/... share one address.
export default defineConfig({
  plugins: [spikeResults(), basicSsl(), cloudflare()],
  server: { host: true },
});
