// The CF Worker: the only place that talks to AI/paid services and holds secrets.
// The browser calls /api/... on our own site; it never sees any keys.

export default {
  async fetch(request, _env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/api/health") {
      return Response.json({ ok: true });
    }

    return Response.json({ error: "Not found" }, { status: 404 });
  },
} satisfies ExportedHandler<Env>;
