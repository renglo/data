import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { RefreshCw } from "lucide-react";

interface ToolDataTmpArtifactProps {
  portfolio: string;
  org: string;
  artifactKey?: string;
}

type ParsedKey = {
  portfolio: string;
  org: string;
  entity: string;
  date: string;
  objectId: string;
};

function parseTmpArtifactKey(key: string): ParsedKey | null {
  const normalized = key.trim().replace(/^\/+|\/+$/g, "");
  const parts = normalized.split("/");
  if (parts.length !== 5) return null;

  const [portfolio, org, entity, date, objectId] = parts;
  if (!portfolio || !org || !entity || !date || !objectId) return null;

  return { portfolio, org, entity, date, objectId };
}

function readKeyFromQuery(): string {
  if (typeof window === "undefined") return "";
  const params = new URLSearchParams(window.location.search);
  return (
    params.get("key") ||
    params.get("artifact_key") ||
    params.get("artifactKey") ||
    ""
  );
}

export default function ToolDataTmpArtifact({
  portfolio,
  org,
  artifactKey,
}: ToolDataTmpArtifactProps) {
  const [inputKey, setInputKey] = useState(artifactKey || readKeyFromQuery());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [resolved, setResolved] = useState<unknown>(null);
  const [raw, setRaw] = useState("");
  const [lastUrl, setLastUrl] = useState("");

  const parsed = useMemo(() => parseTmpArtifactKey(inputKey), [inputKey]);

  const resolveArtifact = async () => {
    setError("");
    setResolved(null);
    setRaw("");

    if (!parsed) {
      setError(
        "Invalid tmp artifact key. Expected: portfolio/org/entity/YYYY-MM-DD/object_id",
      );
      return;
    }

    setLoading(true);
    try {
      const url = `${import.meta.env.VITE_API_URL}/_docs/${parsed.portfolio}/${parsed.org}/${parsed.entity}/${parsed.date}/${parsed.objectId}`;
      setLastUrl(url);

      const response = await fetch(url, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${sessionStorage.accessToken}`,
        },
      });

      const text = await response.text();
      if (!response.ok) {
        setError(`Failed to resolve tmp artifact (${response.status}). ${text}`);
        return;
      }

      setRaw(text);
      try {
        setResolved(JSON.parse(text));
      } catch {
        setResolved(text);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (parsed) {
      resolveArtifact();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main className="grid flex-1 items-stretch gap-4 p-4 sm:px-6 sm:py-0 md:gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Tmp Artifact Resolver</CardTitle>
          <CardDescription>
            Resolve a `tmp_artifact` key via `_docs` and inspect the payload.
            Current workspace: {portfolio}/{org}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <Input
              value={inputKey}
              onChange={(e) => setInputKey(e.target.value)}
              placeholder="portfolio/org/entity/YYYY-MM-DD/object_id"
            />
            <Button
              type="button"
              onClick={resolveArtifact}
              disabled={loading || !inputKey.trim()}
              className="gap-1.5"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
              Resolve
            </Button>
          </div>

          {lastUrl ? (
            <p className="text-xs text-muted-foreground break-all">GET {lastUrl}</p>
          ) : null}

          {error ? (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          ) : null}

          <div className="max-h-[65vh] overflow-auto rounded-md border bg-muted/20 p-3">
            <pre className="whitespace-pre-wrap break-words text-xs leading-relaxed">
              {resolved !== null
                ? JSON.stringify(resolved, null, 2)
                : raw || "No artifact resolved yet."}
            </pre>
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
