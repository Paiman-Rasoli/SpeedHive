import { useEffect, useMemo, useRef, useState } from "react";
import { Channel, invoke } from "@tauri-apps/api/core";
import {
  Check,
  Download,
  Loader2,
  Moon,
  RotateCcw,
  Sun,
  Upload,
} from "lucide-react";

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
      data: { url: string; duration_ms: number };
    }
  | {
      event: "progress";
      data: { elapsed_ms: number; bytes: number; mbps: number };
    }
  | {
      event: "finished";
      data: { elapsed_ms: number; bytes: number; avg_mbps: number };
    }
  | {
      event: "error";
      data: { message: string };
    };

type UploadSpeedEvent =
  | {
      event: "started";
      data: { url: string; duration_ms: number; chunk_size: number };
    }
  | {
      event: "progress";
      data: { elapsed_ms: number; bytes: number; mbps: number };
    }
  | {
      event: "finished";
      data: {
        elapsed_ms: number;
        bytes: number;
        avg_mbps: number;
      };
    }
  | {
      event: "error";
      data: { message: string };
    };

export default function HomePage() {
  const [selectedTest, setSelectedTest] = useState<"download" | "upload">(
    "download"
  );

  // Download state (wired to Rust Channel)
  const [downloadPhase, setDownloadPhase] = useState<
    "idle" | "running" | "finished" | "error"
  >("idle");
  const [downloadMbps, setDownloadMbps] = useState<number | null>(null);
  const [downloadAvgMbps, setDownloadAvgMbps] = useState<number | null>(null);
  const [downloadErrorMsg, setDownloadErrorMsg] = useState<string | null>(null);
  const [downloadElapsedMs, setDownloadElapsedMs] = useState(0);

  // Upload state (separate from download logic)
  const [uploadPhase, setUploadPhase] = useState<
    "idle" | "running" | "finished" | "error"
  >("idle");
  const [uploadMbps, setUploadMbps] = useState<number | null>(null);
  const [uploadAvgMbps, setUploadAvgMbps] = useState<number | null>(null);
  const [uploadErrorMsg, setUploadErrorMsg] = useState<string | null>(null);
  const [uploadElapsedMs, setUploadElapsedMs] = useState(0);
  const [isDark, setIsDark] = useState(() =>
    document.documentElement.classList.contains("dark")
  );

  const onEventRef = useRef<Channel<DownloadSpeedEvent> | null>(null);
  const onUploadEventRef = useRef<Channel<UploadSpeedEvent> | null>(null);
  const timerRef = useRef<number | null>(null);
  const startAtRef = useRef<number | null>(null);
  const uploadTimerRef = useRef<number | null>(null);
  const uploadStartAtRef = useRef<number | null>(null);
  const durationMs = 10_000;
  const uploadChunkSize = 256 * 1024;

  const isAnyRunning = downloadPhase === "running" || uploadPhase === "running";
  const activePhase = selectedTest === "download" ? downloadPhase : uploadPhase;

  const statusText = useMemo(() => {
    if (selectedTest === "download") {
      if (downloadPhase === "running") return "Measuring…";
      if (downloadPhase === "finished") return "Finished";
      if (downloadPhase === "error") return "Try again";
      return "Tap to start";
    }

    if (uploadPhase === "running") return "Measuring…";
    if (uploadPhase === "finished") return "Finished";
    if (uploadPhase === "error") return "Try again";
    return "Tap to start";
  }, [downloadPhase, selectedTest, uploadPhase]);

  const progressPct = useMemo(() => {
    const elapsed =
      selectedTest === "download" ? downloadElapsedMs : uploadElapsedMs;
    if (activePhase === "finished") return 1;
    if (activePhase !== "running") return 0;
    return Math.max(0, Math.min(1, elapsed / durationMs));
  }, [
    activePhase,
    downloadElapsedMs,
    durationMs,
    selectedTest,
    uploadElapsedMs,
  ]);

  useEffect(() => {
    // Timer applies to download test only for now.
    if (downloadPhase !== "running") {
      if (timerRef.current != null) window.clearInterval(timerRef.current);
      timerRef.current = null;
      startAtRef.current = null;
      return;
    }

    startAtRef.current = performance.now();
    timerRef.current = window.setInterval(() => {
      if (startAtRef.current == null) return;
      setDownloadElapsedMs(performance.now() - startAtRef.current);
    }, 50);

    return () => {
      if (timerRef.current != null) window.clearInterval(timerRef.current);
      timerRef.current = null;
      startAtRef.current = null;
    };
  }, [downloadPhase]);

  useEffect(() => {
    // Separate timer for upload.
    if (uploadPhase !== "running") {
      if (uploadTimerRef.current != null)
        window.clearInterval(uploadTimerRef.current);
      uploadTimerRef.current = null;
      uploadStartAtRef.current = null;
      return;
    }

    uploadStartAtRef.current = performance.now();
    uploadTimerRef.current = window.setInterval(() => {
      if (uploadStartAtRef.current == null) return;
      setUploadElapsedMs(performance.now() - uploadStartAtRef.current);
    }, 50);

    return () => {
      if (uploadTimerRef.current != null)
        window.clearInterval(uploadTimerRef.current);
      uploadTimerRef.current = null;
      uploadStartAtRef.current = null;
    };
  }, [uploadPhase]);

  function toggleTheme() {
    document.documentElement.classList.toggle("dark");
    setIsDark(document.documentElement.classList.contains("dark"));
  }

  async function startDownloadTest() {
    if (downloadPhase === "running") return;

    setDownloadErrorMsg(null);
    setDownloadMbps(null);
    setDownloadAvgMbps(null);
    setDownloadElapsedMs(0);
    setDownloadPhase("running");

    const onEvent = new Channel<DownloadSpeedEvent>();
    onEventRef.current = onEvent;

    onEvent.onmessage = (message) => {
      if (!message) return;
      switch (message.event) {
        case "progress":
          setDownloadMbps(message.data.mbps);
          break;
        case "finished":
          setDownloadAvgMbps(message.data.avg_mbps);
          setDownloadPhase("finished");
          break;
        case "error":
          setDownloadErrorMsg(message.data.message);
          setDownloadPhase("error");
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

  async function startUploadTest() {
    if (uploadPhase === "running") return;

    setUploadErrorMsg(null);
    setUploadMbps(null);
    setUploadAvgMbps(null);
    setUploadElapsedMs(0);
    setUploadPhase("running");

    const onEvent = new Channel<UploadSpeedEvent>();
    onUploadEventRef.current = onEvent;

    // Use a ref to track if finished, so late progress events don't overwrite the final value
    const finishedRef = { current: false };

    onEvent.onmessage = (message) => {
      if (!message) return;
      switch (message.event) {
        case "progress":
          // Ignore progress events after finished (they may arrive late due to async timing)
          if (!finishedRef.current) {
            setUploadMbps(message.data.mbps);
          }
          break;
        case "finished":
          finishedRef.current = true;
          setUploadAvgMbps(message.data.avg_mbps);
          // Keep the final displayed value stable by using the avg at the end.
          setUploadMbps(message.data.avg_mbps);
          setUploadPhase("finished");
          break;
        case "error":
          finishedRef.current = true;
          setUploadErrorMsg(message.data.message);
          setUploadPhase("error");
          break;
        case "started":
        default:
          break;
      }
    };

    // Endpoint must accept POST uploads. Configurable later.
    const url = "https://postman-echo.com/post";
    await invoke("upload_speed_test", {
      url,
      durationMs,
      chunkSize: uploadChunkSize,
      onEvent,
    });
  }

  async function startSpeedTest() {
    if (selectedTest === "download") {
      await startDownloadTest();
      return;
    }
    await startUploadTest();
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

                {/* Download / Upload selector (upload reserved for upcoming implementation) */}
                <div className="mt-3 inline-flex rounded-lg border bg-muted/30 p-1">
                  <button
                    type="button"
                    disabled={isAnyRunning}
                    onClick={() => setSelectedTest("download")}
                    className={cn(
                      "inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                      selectedTest === "download"
                        ? "bg-background text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground",
                      isAnyRunning && "cursor-not-allowed opacity-60"
                    )}
                    aria-pressed={selectedTest === "download"}
                  >
                    <Download className="h-3.5 w-3.5" />
                    Download
                  </button>
                  <button
                    type="button"
                    disabled={isAnyRunning}
                    onClick={() => setSelectedTest("upload")}
                    className={cn(
                      "inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                      selectedTest === "upload"
                        ? "bg-background text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground",
                      isAnyRunning && "cursor-not-allowed opacity-60"
                    )}
                    aria-pressed={selectedTest === "upload"}
                  >
                    <Upload className="h-3.5 w-3.5" />
                    Upload
                  </button>
                </div>
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
                disabled={activePhase === "running"}
                onClick={startSpeedTest}
                aria-label={
                  activePhase === "running"
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
                  activePhase === "running" && "active:scale-100"
                )}
              >
                {/* Outer ring like fast.com */}
                <span
                  className={cn(
                    "pointer-events-none absolute inset-0 rounded-full",
                    "ring-1 ring-inset ring-white/20",
                    activePhase === "running"
                      ? "animate-pulse ring-white/25"
                      : "group-hover:ring-white/30"
                  )}
                />

                <div className="text-center">
                  {activePhase === "running" ? (
                    <Loader2 className="mx-auto mb-2 h-6 w-6 animate-spin opacity-90" />
                  ) : activePhase === "finished" ? (
                    <Check className="mx-auto mb-2 h-6 w-6 opacity-90" />
                  ) : null}

                  <div className="text-5xl font-bold tracking-tight">GO</div>
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
                    activePhase === "error"
                      ? "bg-destructive"
                      : activePhase === "finished"
                      ? "bg-emerald-500"
                      : "bg-primary"
                  )}
                  style={{ width: `${progressPct * 100}%` }}
                />
              </div>
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>
                  {selectedTest === "download"
                    ? downloadPhase === "running"
                      ? "Testing…"
                      : downloadPhase === "finished"
                      ? "Completed"
                      : downloadPhase === "error"
                      ? "Failed"
                      : "Ready"
                    : uploadPhase === "running"
                    ? "Testing…"
                    : uploadPhase === "finished"
                    ? "Completed"
                    : uploadPhase === "error"
                    ? "Failed"
                    : "Ready"}
                </span>
                <span>
                  {selectedTest === "download" &&
                  (downloadPhase === "running" || downloadPhase === "finished")
                    ? `${
                        Math.min(durationMs, Math.round(downloadElapsedMs)) /
                        1000
                      }s / ${durationMs / 1000}s`
                    : selectedTest === "upload" &&
                      (uploadPhase === "running" || uploadPhase === "finished")
                    ? `${
                        Math.min(durationMs, Math.round(uploadElapsedMs)) / 1000
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
              </div>
              <div className="rounded-lg border bg-card p-4">
                <div className="text-xs text-muted-foreground">Upload</div>
                <div className="mt-1 text-3xl font-semibold tracking-tight">
                  {uploadMbps == null ? "—" : uploadMbps.toFixed(1)}
                  <span className="ml-2 text-sm font-normal text-muted-foreground">
                    Mbps
                  </span>
                </div>
                {uploadAvgMbps == null ? null : (
                  <div className="mt-1 text-xs text-muted-foreground">
                    Avg: {uploadAvgMbps.toFixed(1)} Mbps
                  </div>
                )}
              </div>
            </div>

            {selectedTest === "download" && downloadErrorMsg ? (
              <div className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                {downloadErrorMsg}
              </div>
            ) : null}

            {selectedTest === "upload" && uploadErrorMsg ? (
              <div className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                {uploadErrorMsg}
              </div>
            ) : null}

            {selectedTest === "download" && downloadPhase === "finished" ? (
              <div className="flex items-center justify-end">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    setDownloadPhase("idle");
                    setDownloadMbps(null);
                    setDownloadAvgMbps(null);
                    setDownloadElapsedMs(0);
                    setDownloadErrorMsg(null);
                  }}
                >
                  <RotateCcw className="mr-2 h-4 w-4" />
                  Run again
                </Button>
              </div>
            ) : null}

            {selectedTest === "upload" && uploadPhase === "finished" ? (
              <div className="flex items-center justify-end">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    setUploadPhase("idle");
                    setUploadMbps(null);
                    setUploadAvgMbps(null);
                    setUploadElapsedMs(0);
                    setUploadErrorMsg(null);
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
