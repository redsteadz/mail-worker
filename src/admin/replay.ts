import { timingSafeEqual } from "../crypto";
import { getRawMessage, updateRawStatus } from "../idempotency/store";
import type { Env } from "../types";

export async function handleReplay(request: Request, env: Env): Promise<Response> {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "";
  if (!await timingSafeEqual(token, env.ADMIN_REPLAY_TOKEN)) {
    return json({ error: "Unauthorized" }, 401);
  }

  const body = await request.json().catch(() => ({})) as { rawMessageId?: string };
  const rawMessageId = body.rawMessageId;
  if (!rawMessageId) return json({ error: "rawMessageId is required" }, 400);

  const row = await getRawMessage(env.DB, rawMessageId);
  if (!row) return json({ error: "raw message not found" }, 404);

  await updateRawStatus(env.DB, rawMessageId, "queued", null);
  await env.INGESTION_QUEUE.send({ rawMessageId });
  return json({ ok: true, rawMessageId });
}

export function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}
