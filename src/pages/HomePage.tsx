import { useEffect, useMemo, useRef, useState } from "react";
import { Channel, invoke } from "@tauri-apps/api/core";
import { Check, Loader2, Moon, RotateCcw, Sun } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

type DownloadSpeedEvent =
  | {
      event: "started";
      data: { url: string; durationMs: number };
    }
  | {
      event: "progress";
      data: { elapsedMs: number; bytes: number; mbps: number };
    }
  | {
      event: "finished";
      data: { elapsedMs: number; bytes: number; avgMbps: number };
    }
  | {
      event: "error";
      data: { message: string };
    };

export default function HomePage() {
  const [phase, setPhase] = useState<"idle" | "running" | "finished" | "error">(
    "idle"
  );
  const [downloadMbps, setDownloadMbps] = useState<number | null>(null);
  const [downloadAvgMbps, setDownloadAvgMbps] = useState<number | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [isDark, setIsDark] = useState(() =>
    document.documentElement.classList.contains("dark")
  );

  const onEventRef = useRef<Channel<DownloadSpeedEvent> | null>(null);
  const timerRef = useRef<number | null>(null);
  const startAtRef = useRef<number | null>(null);
  const durationMs = 10_000;

  const statusText = useMemo(() => {
    if (phase === "running") return "Measuring…";
    if (phase === "finished") return "Finished";
    if (phase === "error") return "Try again";
    return "Tap to start";
  }, [phase]);

  const progressPct = useMemo(() => {
    if (phase === "finished") return 1;
    return Math.max(0, Math.min(1, elapsedMs / durationMs));
  }, [elapsedMs, durationMs, phase]);

  useEffect(() => {
    if (phase !== "running") {
      if (timerRef.current != null) window.clearInterval(timerRef.current);
      timerRef.current = null;
      startAtRef.current = null;
      return;
    }

    startAtRef.current = performance.now();
    timerRef.current = window.setInterval(() => {
      if (startAtRef.current == null) return;
      setElapsedMs(performance.now() - startAtRef.current);
    }, 50);

    return () => {
      if (timerRef.current != null) window.clearInterval(timerRef.current);
      timerRef.current = null;
      startAtRef.current = null;
    };
  }, [phase]);

  function toggleTheme() {
    document.documentElement.classList.toggle("dark");
    setIsDark(document.documentElement.classList.contains("dark"));
  }

  async function startSpeedTest() {
    if (phase === "running") return;

    setErrorMsg(null);
    setDownloadMbps(null);
    setDownloadAvgMbps(null);
    setElapsedMs(0);
    setPhase("running");

    const onEvent = new Channel<DownloadSpeedEvent>();
    onEventRef.current = onEvent;

    onEvent.onmessage = (message) => {
      if (!message) return;
      switch (message.event) {
        case "progress":
          setDownloadMbps(message.data.mbps);
          break;
        case "finished":
          setDownloadAvgMbps(message.data.avgMbps);
          setPhase("finished");
          break;
        case "error":
          setErrorMsg(message.data.message);
          setPhase("error");
          break;
        case "started":
        default:
          break;
      }
    };

    // Example URL; configurable later.
    // Because the download happens in Rust, CORS is not a concern here.
    const url = "https://speed.hetzner.de/100MB.bin";
    await invoke("download_speed_test", { url, durationMs, onEvent });
  }

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="container mx-auto flex min-h-screen flex-col items-center justify-center gap-6 py-10">
        <div className="text-center">
          <h1 className="text-3xl font-semibold tracking-tight">SpeedHive</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Fast, lightweight speed measurement for desktop.
          </p>
        </div>

        <Card className="w-full max-w-xl">
          <CardHeader className="pb-4">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1">
                <CardTitle>Speed Hive</CardTitle>
                <CardDescription>
                  The easiest way to test your internet speed.
                </CardDescription>
              </div>

              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={toggleTheme}
                aria-label="Toggle theme"
                className={cn(
                  "shrink-0",
                  "transition-transform duration-200",
                  "hover:rotate-12 active:rotate-0"
                )}
              >
                {isDark ? (
                  <Sun className="h-4 w-4" />
                ) : (
                  <Moon className="h-4 w-4" />
                )}
              </Button>
            </div>
          </CardHeader>

          <CardContent className="space-y-6">
            <div className="flex items-center justify-center">
              <button
                type="button"
                disabled={phase === "running"}
                onClick={startSpeedTest}
                aria-label={
                  phase === "running"
                    ? "Speed test running"
                    : "Start speed test"
                }
                className={cn(
                  "group relative grid h-56 w-56 place-items-center rounded-full",
                  "bg-primary text-primary-foreground shadow-lg",
                  "transition-all duration-200",
                  "hover:shadow-xl active:scale-[0.99]",
                  "focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring focus-visible:ring-offset-4 focus-visible:ring-offset-background",
                  "disabled:cursor-not-allowed disabled:opacity-80",
                  phase === "running" && "active:scale-100"
                )}
              >
                {/* Outer ring like fast.com */}
                <span
                  className={cn(
                    "pointer-events-none absolute inset-0 rounded-full",
                    "ring-1 ring-inset ring-white/20",
                    phase === "running"
                      ? "animate-pulse ring-white/25"
                      : "group-hover:ring-white/30"
                  )}
                />

                <div className="text-center">
                  {phase === "running" ? (
                    <Loader2 className="mx-auto mb-2 h-6 w-6 animate-spin opacity-90" />
                  ) : phase === "finished" ? (
                    <Check className="mx-auto mb-2 h-6 w-6 opacity-90" />
                  ) : null}

                  <div className="text-5xl font-bold tracking-tight">
                    {phase === "finished" ? "GO" : "GO"}
                  </div>
                  <div className="mt-2 text-xs opacity-90">{statusText}</div>
                </div>
              </button>
            </div>

            {/* Progress / completion indicator */}
            <div className="space-y-2">
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className={cn(
                    "h-full rounded-full transition-[width] duration-200",
                    phase === "error"
                      ? "bg-destructive"
                      : phase === "finished"
                      ? "bg-emerald-500"
                      : "bg-primary"
                  )}
                  style={{ width: `${progressPct * 100}%` }}
                />
              </div>
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>
                  {phase === "running"
                    ? "Testing…"
                    : phase === "finished"
                    ? "Completed"
                    : phase === "error"
                    ? "Failed"
                    : "Ready"}
                </span>
                <span>
                  {phase === "running" || phase === "finished"
                    ? `${
                        Math.min(durationMs, Math.round(elapsedMs)) / 1000
                      }s / ${durationMs / 1000}s`
                    : ""}
                </span>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg border bg-card p-4">
                <div className="text-xs text-muted-foreground">Download</div>
                <div className="mt-1 text-3xl font-semibold tracking-tight">
                  {downloadMbps == null ? "—" : downloadMbps.toFixed(1)}
                  <span className="ml-2 text-sm font-normal text-muted-foreground">
                    Mbps
                  </span>
                </div>
                {downloadAvgMbps == null ? null : (
                  <div className="mt-1 text-xs text-muted-foreground">
                    Avg: {downloadAvgMbps.toFixed(1)} Mbps
                  </div>
                )}
              </div>
              <div className="rounded-lg border bg-card p-4">
                <div className="text-xs text-muted-foreground">Upload</div>
                <div className="mt-1 text-3xl font-semibold tracking-tight">
                  —
                  <span className="ml-2 text-sm font-normal text-muted-foreground">
                    Mbps
                  </span>
                </div>
              </div>
            </div>

            {errorMsg ? (
              <div className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                {errorMsg}
              </div>
            ) : null}

            {phase === "finished" ? (
              <div className="flex items-center justify-end">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    setPhase("idle");
                    setDownloadMbps(null);
                    setDownloadAvgMbps(null);
                    setElapsedMs(0);
                    setErrorMsg(null);
                  }}
                >
                  <RotateCcw className="mr-2 h-4 w-4" />
                  Run again
                </Button>
              </div>
            ) : null}
          </CardContent>

          <CardFooter className="justify-end gap-2" />
        </Card>
      </div>
    </main>
  );
}
