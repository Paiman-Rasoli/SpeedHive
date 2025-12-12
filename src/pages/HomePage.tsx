import { useMemo, useState } from "react";

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

export default function HomePage() {
  const [isRunning, setIsRunning] = useState(false);

  const statusText = useMemo(() => {
    if (isRunning) return "Measuring…";
    return "Tap to start";
  }, [isRunning]);

  function startSpeedTest() {
    // Frontend-only for now.
    // TODO: wire to Tauri command that calls Rust (e.g. get_download_speed / speed test runner).
    // await invoke("get_download_speed")
    setIsRunning(true);
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
            <CardTitle>Speed test</CardTitle>
            <CardDescription>
              Click the big button to begin. (Backend hook coming next.)
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-6">
            <div className="flex items-center justify-center">
              <button
                type="button"
                disabled={isRunning}
                onClick={startSpeedTest}
                aria-label={
                  isRunning ? "Speed test running" : "Start speed test"
                }
                className={cn(
                  "group relative grid h-56 w-56 place-items-center rounded-full",
                  "bg-primary text-primary-foreground shadow-lg",
                  "transition-all duration-200",
                  "hover:shadow-xl active:scale-[0.99]",
                  "focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring focus-visible:ring-offset-4 focus-visible:ring-offset-background",
                  "disabled:cursor-not-allowed disabled:opacity-70"
                )}
              >
                {/* Outer ring like fast.com */}
                <span
                  className={cn(
                    "pointer-events-none absolute inset-0 rounded-full",
                    "ring-1 ring-inset ring-white/20",
                    isRunning ? "animate-pulse" : "group-hover:ring-white/30"
                  )}
                />

                <div className="text-center">
                  <div className="text-5xl font-bold tracking-tight">GO</div>
                  <div className="mt-2 text-xs opacity-90">{statusText}</div>
                </div>
              </button>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg border bg-card p-4">
                <div className="text-xs text-muted-foreground">Download</div>
                <div className="mt-1 text-3xl font-semibold tracking-tight">
                  —
                  <span className="ml-2 text-sm font-normal text-muted-foreground">
                    Mbps
                  </span>
                </div>
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
          </CardContent>

          <CardFooter className="justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => document.documentElement.classList.toggle("dark")}
            >
              Toggle theme
            </Button>
          </CardFooter>
        </Card>
      </div>
    </main>
  );
}
