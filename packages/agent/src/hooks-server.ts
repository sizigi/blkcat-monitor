import type { AgentHookEventMessage } from "@blkcat/shared";

interface HooksServerOptions {
  port: number;
  machineId: string;
  onHookEvent: (event: AgentHookEventMessage) => void;
  resolvePaneId: (tmuxPane: string) => string | null;
}

export class HooksServer {
  private server: ReturnType<typeof Bun.serve>;

  constructor(private opts: HooksServerOptions) {
    this.server = Bun.serve({
      port: opts.port,
      fetch: async (req) => {
        const url = new URL(req.url);
        if (url.pathname !== "/hooks") {
          return new Response("Not found", { status: 404 });
        }
        if (req.method !== "POST") {
          return new Response("Method not allowed", { status: 405 });
        }

        try {
          const body = (await req.json()) as Record<string, unknown>;
          if (
            !body.hook_event_name ||
            typeof body.hook_event_name !== "string"
          ) {
            return Response.json(
              { error: "hook_event_name is required" },
              { status: 400 },
            );
          }

          const sessionId =
            typeof body.tmux_pane === "string" && body.tmux_pane
              ? opts.resolvePaneId(body.tmux_pane)
              : null;

          // Extract matcher: tool_name for tool events, source for SessionStart, etc.
          const matcher =
            typeof body.tool_name === "string"
              ? body.tool_name
              : typeof body.source === "string"
                ? body.source
                : null;

          // Remove tmux_pane from data (it's agent-internal)
          const { tmux_pane: _, ...data } = body;

          const event: AgentHookEventMessage = {
            type: "hook_event",
            machineId: opts.machineId,
            sessionId,
            hookEventName: body.hook_event_name as string,
            matcher,
            data: data as Record<string, unknown>,
            timestamp: Date.now(),
          };

          try {
            opts.onHookEvent(event);
          } catch (err) {
            console.error("[HooksServer] onHookEvent threw:", err);
          }
          return Response.json({ ok: true });
        } catch {
          return Response.json({ error: "Invalid JSON" }, { status: 400 });
        }
      },
    });
  }

  get port() {
    return this.server.port;
  }

  stop() {
    this.server.stop();
  }
}
