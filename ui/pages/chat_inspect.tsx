// @ts-nocheck — chat widget props follow extension loops; path aliases are not always resolved in IDE.
import { useState, useEffect, useMemo } from "react";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import { ChevronDown, MessageSquarePlus, RefreshCw } from "lucide-react";

import ChatWidgetJson from "@/components/console/chat-widget-json";
import ChatWidgetText from "@/components/console/chat-widget-text";
import ChatWidgetTransient from "@/components/console/chat-widget-transient";
import ChatWidgetError from "@/components/console/chat-widget-error";
import ChatWidgetCommand from "@/components/console/chat-widget-command";
import ChatWidgetWorkspace from "@/components/console/chat-widget-workspace";

import ChatWidgetPlanPreview from "@/components/console/chat-widget-plan-preview";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface AgentProps {
  portfolio: string;
  org: string;
  tool: string;
  tree?: { portfolios: Record<string, Portfolio> };
  onNavigate?: (path: string) => void;
  /** URL query: `entity_type` and `entity_id` pre-fill and load the session. */
  query?: Record<string, string>;
}

interface Portfolio {
  name: string;
  portfolio_id: string;
  orgs: Record<string, Org>;
  tools: Record<string, Tool>;
}

interface Org {
  name: string;
  org_id: string;
  tools: string[];
}

interface Tool {
  name: string;
  handle: string;
}

interface Message {
  author_id: string;
  time: number;
  is_active: boolean;
  context: Record<string, unknown>;
  messages?: unknown[];
  events?: unknown[];
  tool_invocations: unknown[];
  irn: string;
}

interface Workspace {
  author_id: string;
  time: number;
  is_active: boolean;
  context: Record<string, unknown>;
  type: string;
  config: Record<string, unknown>;
  data: unknown[];
  irn: string;
}

interface ThreadItem {
  _id: string;
  time: string;
  is_active?: boolean;
}

/** Inspector: load ``entity_type`` + ``entity_id``, view threads/messages/workspaces, create threads. No chat input. */
export default function ChatInspect({ portfolio, org, tool, tree, query }: AgentProps) {
  const portfolio_name = tree?.portfolios[portfolio]?.name;
  const org_name = tree?.portfolios[portfolio]?.orgs[org]?.name;
  const tool_name = tool ? tree?.portfolios[portfolio]?.tools[tool]?.name : undefined;

  const [entityTypeInput, setEntityTypeInput] = useState("");
  const [entityIdInput, setEntityIdInput] = useState("");
  const [entityType, setEntityType] = useState("");
  const [entityId, setEntityId] = useState("");

  const [threads, setThreads] = useState<{ items: ThreadItem[] }>({ items: [] });
  const [messages, setMessages] = useState<Message[]>([]);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [activeThread, setActiveThread] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);
  const [refreshingChat, setRefreshingChat] = useState(false);
  const [creatingThread, setCreatingThread] = useState(false);
  /** Bumps on every "Load conversation" so we refetch even when entity_type/entity_id are unchanged. */
  const [loadNonce, setLoadNonce] = useState(0);

  /** `_chat` vs `_session` API prefix (same path after portfolio/org/entity…). */
  const [apiSegment, setApiSegment] = useState<"_chat" | "_session">("_chat");

  const [isAtBottom, setIsAtBottom] = useState(true);

  useEffect(() => {
    const et = (query?.entity_type ?? query?.entityType ?? "").trim();
    const eid = (query?.entity_id ?? query?.entityId ?? "").trim();
    if (!et || !eid) return;
    setEntityTypeInput(et);
    setEntityIdInput(eid);
    setEntityType(et);
    setEntityId(eid);
    setActiveThread(null);
    setMessages([]);
    setWorkspaces([]);
    setThreads({ items: [] });
  }, [query?.entity_type, query?.entity_id, query?.entityType, query?.entityId]);

  useEffect(() => {
    const el = document.getElementById("messageContainer");
    if (el) {
      el.scrollTop = el.scrollHeight;
      setIsAtBottom(true);
    }
  }, [messages]);

  useEffect(() => {
    const el = document.getElementById("workspaceContainer");
    if (el) {
      el.scrollTop = el.scrollHeight;
      setIsAtBottom(true);
    }
  }, [messages, workspaces]);

  const applyCoordinates = () => {
    const et = entityTypeInput.trim();
    const eid = entityIdInput.trim();
    if (!et || !eid) {
      setLoadError("Enter both entity type and entity id.");
      return;
    }
    setLoadError(null);
    setLoadNonce((n) => n + 1);
    setEntityType(et);
    setEntityId(eid);
    setActiveThread(null);
    setMessages([]);
    setWorkspaces([]);
    setThreads({ items: [] });
  };

  useEffect(() => {
    if (!entityType || !entityId) return;

    const fetchThreads = async () => {
      setLoading(true);
      setLoadError(null);
      try {
        const response = await fetch(
          `${import.meta.env.VITE_API_URL}/${apiSegment}/${portfolio}/${org}/${entityType}/${entityId}`,
          {
            method: "GET",
            headers: { Authorization: `Bearer ${sessionStorage.accessToken}` },
          }
        );
        const threads_list = await response.json();
        if (!response.ok) {
          setLoadError(typeof threads_list?.message === "string" ? threads_list.message : "Failed to load threads");
          setThreads({ items: [] });
          setActiveThread(null);
          return;
        }
        const items: ThreadItem[] = threads_list?.items ?? [];
        setThreads({ items });
        if (items.length === 0) {
          setActiveThread(null);
          setLoadError("No threads for this session.");
        } else {
          const activeT = items.find((t) => t.is_active) ?? items[0];
          setActiveThread(activeT._id);
        }
      } catch (e) {
        console.error(e);
        setLoadError("Error loading threads.");
        setThreads({ items: [] });
        setActiveThread(null);
      } finally {
        setLoading(false);
      }
    };

    fetchThreads();
  }, [portfolio, org, entityType, entityId, loadNonce, apiSegment]);

  useEffect(() => {
    if (!entityType || !entityId || !activeThread) return;

    const fetchMessages = async () => {
      if (refreshTick > 0) setRefreshingChat(true);
      try {
        const response = await fetch(
          `${import.meta.env.VITE_API_URL}/${apiSegment}/${portfolio}/${org}/${entityType}/${entityId}/${activeThread}/messages`,
          {
            method: "GET",
            headers: { Authorization: `Bearer ${sessionStorage.accessToken}` },
          }
        );
        const data = await response.json();
        setMessages(data?.items ?? []);
      } catch (error) {
        console.error("Error fetching messages:", error);
        setMessages([]);
      } finally {
        if (refreshTick > 0) setRefreshingChat(false);
      }
    };

    fetchMessages();
  }, [portfolio, org, entityType, entityId, activeThread, refreshTick, apiSegment]);

  useEffect(() => {
    if (!entityType || !entityId || !activeThread) return;

    const fetchWorkspaces = async () => {
      try {
        const response = await fetch(
          `${import.meta.env.VITE_API_URL}/${apiSegment}/${portfolio}/${org}/${entityType}/${entityId}/${activeThread}/workspaces`,
          {
            method: "GET",
            headers: { Authorization: `Bearer ${sessionStorage.accessToken}` },
          }
        );
        const data = await response.json();
        setWorkspaces(data?.items ?? []);
      } catch (error) {
        console.error("Error fetching workspaces:", error);
        setWorkspaces([]);
      }
    };

    fetchWorkspaces();
  }, [portfolio, org, entityType, entityId, activeThread, refreshTick, apiSegment]);

  const refreshChat = () => {
    setRefreshTick((n) => n + 1);
  };

  const createNewThread = async () => {
    if (!entityType || !entityId) return;
    setCreatingThread(true);
    setLoadError(null);
    try {
      const res = await fetch(
        `${import.meta.env.VITE_API_URL}/${apiSegment}/${portfolio}/${org}/${entityType}/${entityId}`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${sessionStorage.accessToken}` },
        }
      );
      const body = await res.json();
      const success = body?.success === true;
      const document = body?.document;
      if (!res.ok || !success || !document?._id) {
        setLoadError(
          typeof body?.message === "string" ? body.message : "Failed to create thread"
        );
        return;
      }
      const doc = document as ThreadItem;
      const listRes = await fetch(
        `${import.meta.env.VITE_API_URL}/${apiSegment}/${portfolio}/${org}/${entityType}/${entityId}`,
        {
          method: "GET",
          headers: { Authorization: `Bearer ${sessionStorage.accessToken}` },
        }
      );
      const listBody = await listRes.json();
      if (listRes.ok && Array.isArray(listBody?.items) && listBody.items.length > 0) {
        setThreads({ items: listBody.items as ThreadItem[] });
      } else {
        setThreads((prev) => ({
          items: [doc, ...prev.items.filter((t) => t._id !== doc._id)],
        }));
      }
      setActiveThread(doc._id);
      setMessages([]);
      setWorkspaces([]);
    } catch (e) {
      console.error(e);
      setLoadError("Error creating thread.");
    } finally {
      setCreatingThread(false);
    }
  };

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const bottom =
      Math.abs(e.currentTarget.scrollHeight - e.currentTarget.scrollTop - e.currentTarget.clientHeight) < 1;
    setIsAtBottom(bottom);
  };

  /** Per turn: ``events`` (e.g. session/Claw) if present, otherwise ``messages`` (chat). */
  const turnEntries = (m: Message): unknown[] => {
    if (Array.isArray(m.events) && m.events.length > 0) return m.events;
    if (Array.isArray(m.messages)) return m.messages;
    return [];
  };

  const entriesForContinuity = (m: Message): unknown[] => {
    if (Array.isArray(m.events) && m.events.length > 0) return m.events;
    if (Array.isArray(m.messages)) return m.messages.slice(1);
    return [];
  };

  const pickNext = (item: unknown): string | null => {
    if (!item || typeof item !== "object") return null;
    const row = item as Record<string, unknown>;
    const direct = row["_next"];
    if (typeof direct === "string" && direct.trim() !== "") return direct;
    const out = row["_out"];
    if (out && typeof out === "object" && out !== null) {
      const nested = (out as Record<string, unknown>)["_next"];
      if (typeof nested === "string" && nested.trim() !== "") return nested;
    }
    return null;
  };

  const continuityId = useMemo(() => {
    let last: string | null = null;
    for (const m of messages) {
      for (const item of entriesForContinuity(m)) {
        const n = pickNext(item);
        if (n) last = n;
      }
    }
    return last;
  }, [messages]);


  const renderInspectRollItem = (item: unknown, idx: number) => {
    const it = item as Record<string, unknown>;
    if (it["_type"] === "tool_rs" && it["_interface"] === "plan") {
      return <ChatWidgetPlanPreview key={idx} key_id={String(idx)} item={it as any} />;
    }
    const ct = it["_type"] as string | undefined;
    const raw = (it["_out"] as { content?: unknown } | undefined)?.content;
    const clawText =
      raw == null
        ? ""
        : typeof raw === "object"
          ? JSON.stringify(raw)
          : String(raw);

    if (ct === "user_message") {
      return (
        <div
          key={idx}
          className="mb-2 flex max-w-[80%] flex-col self-end rounded-xl bg-muted p-4 text-sm"
        >
          {clawText}
        </div>
      );
    }
    if (ct === "assistant_message") {
      return (
        <div
          key={idx}
          className="mb-2 flex max-w-[80%] flex-col self-start rounded-xl bg-primary/10 p-4 text-sm"
        >
          {clawText}
        </div>
      );
    }
    if (ct === "tool_call" || ct === "tool_result") {
      return (
        <div
          key={idx}
          className="mb-2 flex max-w-[95%] flex-col self-start rounded-md border bg-muted/30 p-2 font-mono text-xs text-muted-foreground"
        >
          <div className="mb-1 text-[10px] uppercase tracking-wide opacity-80">{ct}</div>
          <pre className="whitespace-pre-wrap break-words">{clawText}</pre>
        </div>
      );
    }
    if (ct === "claw_stream" || ct === "claw_signal" || ct === "claw_subagent_message") {
      let realtimeBody = clawText;
      if (typeof raw === "string") {
        try {
          realtimeBody = JSON.stringify(JSON.parse(raw), null, 2);
        } catch {
          realtimeBody = raw;
        }
      }
      return (
        <div
          key={idx}
          className="mb-2 flex max-w-[95%] flex-col self-start rounded-md border border-dashed bg-muted/20 p-2 font-mono text-xs text-muted-foreground"
        >
          <div className="mb-1 text-[10px] uppercase tracking-wide opacity-80">{ct}</div>
          <pre className="whitespace-pre-wrap break-words">{realtimeBody}</pre>
        </div>
      );
    }

    const t = ct;
    const anyItem = it as any;
    if (t === "json")
      return <ChatWidgetJson key={idx} key_id={String(idx)} item={anyItem} active={true} />;
    if (t === "text") return <ChatWidgetText key={idx} key_id={String(idx)} item={anyItem} />;
    if (t === "command") return <ChatWidgetCommand key={idx} key_id={String(idx)} item={anyItem} />;
    if (t === "transient") return <ChatWidgetTransient key={idx} key_id={String(idx)} item={anyItem} />;
    if (t === "error") return <ChatWidgetError key={idx} key_id={String(idx)} item={anyItem} />;
    if (t === "consent" && it["_interface"] === "binary_consent")
      return <ChatWidgetText key={idx} key_id={String(idx)} item={anyItem} />;
    return null;
  };

  return (
    <div className="flex min-h-0 w-full flex-col gap-4 p-4">
      <Card>
        <CardHeader>
          <CardTitle>Inspect Chat</CardTitle>
          <CardDescription>
            View-only (no message input). Uses portfolio <strong>{portfolio}</strong> and org <strong>{org}</strong> from the route.
            {portfolio_name && org_name && (
              <span>
                {" "}
                ({portfolio_name} / {org_name}
                {tool_name ? ` / ${tool_name}` : ""})
              </span>
            )}
            {" "}
            Optional URL:{" "}
            <code className="rounded bg-muted px-1 text-xs">{`?entity_type=…&entity_id=…`}</code>{" "}
            (camelCase <code className="text-xs">entityType</code> / <code className="text-xs">entityId</code> also work.)
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end">
          <div className="grid w-full max-w-md gap-2">
            <Label htmlFor="inspect-entity-type">entity_type</Label>
            <Input
              id="inspect-entity-type"
              value={entityTypeInput}
              onChange={(e) => setEntityTypeInput(e.target.value)}
              placeholder="e.g. q_org_ref"
              autoComplete="off"
            />
          </div>
          <div className="grid w-full max-w-md flex-1 gap-2">
            <Label htmlFor="inspect-entity-id">entity_id</Label>
            <Input
              id="inspect-entity-id"
              value={entityIdInput}
              onChange={(e) => setEntityIdInput(e.target.value)}
              placeholder="Session coordinate"
              autoComplete="off"
            />
          </div>
          <div className="grid w-full min-w-[180px] max-w-xs gap-2">
            <Label htmlFor="inspect-api-segment">API</Label>
            <Select value={apiSegment} onValueChange={(v) => setApiSegment(v as "_chat" | "_session")}>
              <SelectTrigger id="inspect-api-segment">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="_chat">_chat</SelectItem>
                <SelectItem value="_session">_session</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button type="button" onClick={applyCoordinates} disabled={loading || creatingThread}>
            {loading ? "Loading…" : "Load conversation"}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={refreshChat}
            disabled={!entityType || !entityId || !activeThread || refreshingChat || loading || creatingThread}
            title="Reload messages and workspace for the current thread"
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${refreshingChat ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={createNewThread}
            disabled={!entityType || !entityId || loading || creatingThread}
            title="Create another thread for this entity (same API as the agent loop)"
          >
            <MessageSquarePlus className="mr-2 h-4 w-4" />
            {creatingThread ? "Creating…" : "New thread"}
          </Button>
        </CardContent>
        {loadError && <p className="px-6 pb-4 text-sm text-destructive">{loadError}</p>}
      </Card>

      {entityType && entityId && !loading && threads.items.length > 0 && (
        <div className="flex max-w-4xl flex-wrap items-end gap-4">
          <div className="flex min-w-[220px] flex-1 flex-col gap-2">
            <Label htmlFor="inspect-thread-select">Thread</Label>
            <Select value={activeThread ?? undefined} onValueChange={(v) => setActiveThread(v)}>
              <SelectTrigger id="inspect-thread-select" className="w-full">
                <SelectValue placeholder="Select thread" />
              </SelectTrigger>
              <SelectContent>
                {threads.items.map((t) => (
                  <SelectItem key={t._id} value={t._id}>
                    {t._id.slice(0, 12)}… ·{" "}
                    {t.time ? new Date(parseFloat(t.time) * 1000).toLocaleString() : "—"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {activeThread && (
            <div className="flex min-w-0 max-w-xl flex-1 flex-col gap-2">
              <Label title="Last _next string from loaded turns (same as agent loop payload).">
                Continuity ID
              </Label>
              <code
                className="flex h-10 items-center truncate rounded-md border bg-muted px-2 font-mono text-xs leading-normal"
                title={continuityId ?? undefined}
              >
                {continuityId ?? "—"}
              </code>
            </div>
          )}
        </div>
      )}

      {activeThread && entityType && entityId && (
        <PanelGroup direction="horizontal" className="min-h-[calc(100vh-280px)]">
          <Panel defaultSize={35} minSize={20}>
            <span className="flex h-[calc(100vh-280px)] flex-col rounded-t-none">
              <span className="relative flex min-h-0 flex-1 flex-col">
                <div className="pointer-events-none absolute left-0 right-0 top-0 z-10 h-8 shadow-[inset_0_20px_20px_-10px_rgba(0,0,0,0.3)]" />
                <div
                  className="relative flex-1 overflow-y-auto"
                  id="workspaceContainer"
                  onScroll={handleScroll}
                >
                  <div className="relative px-4 sm:px-6">
                    {Array.isArray(workspaces) && workspaces.length > 0 ? (
                      workspaces.map((m, index) => (
                        <div key={index} className="mb-4 mt-6 flex flex-col">
                          {m["type"] === "json" ? (
                            <ChatWidgetWorkspace
                              key_id={String(index)}
                              item={{ _out: m } as any}
                              active={index === workspaces.length - 1}
                            />
                          ) : m["type"] === "text" ? (
                            <ChatWidgetText key_id={String(index)} item={{ _out: m } as any} active={true} />
                          ) : m["type"] === "command" ? (
                            <ChatWidgetCommand key_id={String(index)} item={{ _out: m } as any} active={true} />
                          ) : (
                            <ChatWidgetText key_id={String(index)} item={{ _out: m } as any} active={true} />
                          )}
                        </div>
                      ))
                    ) : (
                      <div className="mb-4 mt-6 flex flex-col">
                        <ChatWidgetWorkspace
                          key_id="default"
                          item={{ _out: { message: "No workspace rows" } } as any}
                        />
                      </div>
                    )}
                  </div>
                  <div className="sticky bottom-0 left-0 right-0 z-20 h-6">
                    <div className="pointer-events-none h-full bg-gradient-to-t from-background via-background/20 to-transparent" />
                    {!isAtBottom && (
                      <div
                        className="absolute bottom-2 left-1/2 -translate-x-1/2 transform cursor-pointer text-muted-foreground hover:text-foreground"
                        onClick={() => {
                          document.getElementById("workspaceContainer")?.scrollTo({
                            top: document.getElementById("workspaceContainer")?.scrollHeight,
                            behavior: "smooth",
                          });
                        }}
                      >
                        <ChevronDown className="h-5 w-5 animate-bounce" />
                      </div>
                    )}
                  </div>
                </div>
              </span>
            </span>
          </Panel>

          <PanelResizeHandle className="w-1 bg-border hover:bg-primary/50 transition-colors" />

          <Panel defaultSize={65} minSize={30}>
            <span className="flex h-[calc(100vh-280px)] flex-col rounded-t-none">
              <span className="relative flex min-h-0 flex-1 flex-col">
                <div className="pointer-events-none absolute left-0 right-0 top-0 z-10 h-8 shadow-[inset_0_20px_20px_-10px_rgba(0,0,0,0.3)]" />
                <div className="relative flex-1 overflow-y-auto" id="messageContainer" onScroll={handleScroll}>
                  <div className="relative px-4 pb-16 sm:px-6">
                    {Array.isArray(messages) &&
                      messages.map((m, index) => {
                        const entries = turnEntries(m) ?? [];
                        return (
                          <div key={index} className="mb-4 flex flex-col">
                            <div className="mb-2 mt-4 text-center text-sm text-muted-foreground">
                              {m?.time
                                ? new Date(m.time * 1000)
                                    .toLocaleString("en-US", {
                                      weekday: "short",
                                      month: "short",
                                      day: "numeric",
                                      hour: "numeric",
                                      minute: "2-digit",
                                      hour12: true,
                                    })
                                    .replace(/(\w+)\s+(\w+)\s+(\d+)\s+at/, "$1, $2 $3 at")
                                : ""}
                            </div>
                            {entries.map((item, idx) => renderInspectRollItem(item, idx))}
                          </div>
                        );
                      })}
                  </div>
                  <div className="sticky bottom-0 left-0 right-0 z-20 h-6">
                    <div className="pointer-events-none h-full bg-gradient-to-t from-background via-background/20 to-transparent" />
                    {!isAtBottom && (
                      <div
                        className="absolute bottom-2 left-1/2 -translate-x-1/2 transform cursor-pointer text-muted-foreground hover:text-foreground"
                        onClick={() => {
                          document.getElementById("messageContainer")?.scrollTo({
                            top: document.getElementById("messageContainer")?.scrollHeight,
                            behavior: "smooth",
                          });
                        }}
                      >
                        <ChevronDown className="h-5 w-5 animate-bounce" />
                      </div>
                    )}
                  </div>
                </div>
              </span>
            </span>
          </Panel>
        </PanelGroup>
      )}
    </div>
  );
}
