import { subscribe } from "@/lib/mockStore";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  const enc = new TextEncoder();
  let cleanup = () => {};
  const stream = new ReadableStream({
    start(controller) {
      const send = (s: string) => { try { controller.enqueue(enc.encode(s)); } catch { cleanup(); } };
      send(": connected\n\n");
      const unsub = subscribe((m) => send(`event: ${m.event}\ndata: ${JSON.stringify(m.data)}\n\n`));
      const ping = setInterval(() => send(": ping\n\n"), 15000);
      cleanup = () => { clearInterval(ping); unsub(); };
      req.signal.addEventListener("abort", () => { cleanup(); try { controller.close(); } catch {} });
    },
    cancel() { cleanup(); },
  });
  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive", "X-Accel-Buffering": "no" },
  });
}
