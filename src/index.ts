import { handleReplay, json } from "./admin/replay";
import { handleEmail } from "./email";
import { consumeQueue } from "./queue/consumer";
import { handleScheduled } from "./scheduled";
import type { Env, IngestionQueueMessage } from "./types";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/health") {
      return json({ ok: true });
    }
    if (request.method === "POST" && url.pathname === "/admin/replay") {
      return handleReplay(request, env);
    }
    return json({ error: "Not found" }, 404);
  },

  async email(message: ForwardableEmailMessage, env: Env): Promise<void> {
    await handleEmail(message, env);
  },

  async queue(batch: MessageBatch<IngestionQueueMessage>, env: Env): Promise<void> {
    await consumeQueue(batch, env);
  },

  async scheduled(_controller: ScheduledController, env: Env): Promise<void> {
    await handleScheduled(env);
  }
};
