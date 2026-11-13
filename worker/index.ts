// The CF Worker: the only place that talks to AI/paid services and holds secrets.
// The browser calls /api/... on our own site; it never sees any keys.
// Nothing is stored: each request is processed and forgotten. Never log audio,
// transcripts or secret values.

const WHISPER_MODEL = "@cf/openai/whisper-large-v3-turbo";
/** ~10 s of speech is 20–200 KB depending on format; anything far bigger is refused. */
const MAX_AUDIO_BYTES = 1_000_000;
const ALLOWED_AUDIO_TYPES = ["audio/webm", "audio/mp4", "audio/ogg", "audio/wav", "audio/mpeg"];

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

/** Base64-encodes in chunks (a single btoa call on a big buffer can overflow the call stack). */
function toBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

/** Rate-limits AI calls per client. Locally there's no client IP header, so everyone shares one bucket. */
async function rateLimited(request: Request, env: Env): Promise<boolean> {
  const key = request.headers.get("cf-connecting-ip") ?? "local";
  const { success } = await env.AI_LIMITER.limit({ key });
  return !success;
}

async function transcribe(request: Request, env: Env): Promise<Response> {
  if (request.method !== "POST") return json({ error: "Use POST" }, 405);

  const contentType = (request.headers.get("content-type") ?? "").split(";")[0]?.trim() ?? "";
  if (!ALLOWED_AUDIO_TYPES.includes(contentType)) {
    return json({ error: `Unsupported audio type '${contentType}'` }, 415);
  }
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (declared > MAX_AUDIO_BYTES) return json({ error: "Audio too large" }, 413);

  if (await rateLimited(request, env)) return json({ error: "Too many requests, slow down" }, 429);

  const audio = new Uint8Array(await request.arrayBuffer());
  if (audio.byteLength === 0) return json({ error: "No audio" }, 400);
  if (audio.byteLength > MAX_AUDIO_BYTES) return json({ error: "Audio too large" }, 413);

  const started = Date.now();
  try {
    const result = await env.AI.run(WHISPER_MODEL, {
      audio: toBase64(audio),
      language: "en",
      vad_filter: true,
    });
    return json({
      model: WHISPER_MODEL,
      bytes: audio.byteLength,
      contentType,
      sttMs: Date.now() - started,
      result,
    });
  } catch (err) {
    // Message only: never echo the audio back.
    return json({ error: "Transcription failed", detail: err instanceof Error ? err.message : String(err) }, 502);
  }
}

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/api/health") return json({ ok: true });
    if (url.pathname === "/api/transcribe") return transcribe(request, env);

    return json({ error: "Not found" }, 404);
  },
} satisfies ExportedHandler<Env>;
