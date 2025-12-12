import { useState } from "react";
import reactLogo from "@/assets/react.svg";
import { invoke } from "@tauri-apps/api/core";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function HomePage() {
  const [greetMsg, setGreetMsg] = useState("");
  const [name, setName] = useState("");

  async function greet() {
    // Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
    setGreetMsg(await invoke("greet", { name }));
  }

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="container mx-auto flex min-h-screen items-center justify-center">
        <Card className="w-full max-w-xl">
          <CardHeader className="space-y-4">
            <div className="flex items-center justify-center gap-4">
              <a href="https://vite.dev" target="_blank" rel="noreferrer">
                <img
                  src="/vite.svg"
                  className="h-12 w-12 transition-transform hover:scale-105"
                  alt="Vite logo"
                />
              </a>
              <a href="https://tauri.app" target="_blank" rel="noreferrer">
                <img
                  src="/tauri.svg"
                  className="h-12 w-12 transition-transform hover:scale-105"
                  alt="Tauri logo"
                />
              </a>
              <a href="https://react.dev" target="_blank" rel="noreferrer">
                <img
                  src={reactLogo}
                  className="h-12 w-12 transition-transform hover:scale-105"
                  alt="React logo"
                />
              </a>
            </div>

            <div className="space-y-1">
              <CardTitle>Welcome to Tauri + React</CardTitle>
              <CardDescription>
                TailwindCSS + shadcn/ui are wired. This is the index route (/)
                page.
              </CardDescription>
            </div>
          </CardHeader>

          <CardContent className="space-y-4">
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                greet();
              }}
            >
              <input
                value={name}
                onChange={(e) => setName(e.currentTarget.value)}
                placeholder="Enter a name..."
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm outline-none ring-offset-background placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
              />
              <Button type="submit">Greet</Button>
            </form>

            {greetMsg ? (
              <div className="rounded-md border bg-muted/40 px-4 py-3 text-sm">
                {greetMsg}
              </div>
            ) : null}
          </CardContent>

          <CardFooter className="justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setName("");
                setGreetMsg("");
              }}
            >
              Clear
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => document.documentElement.classList.toggle("dark")}
            >
              Toggle dark
            </Button>
          </CardFooter>
        </Card>
      </div>
    </main>
  );
}
