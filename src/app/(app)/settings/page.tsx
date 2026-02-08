"use client";

import { useAppStore } from "@/lib/store";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Sun, Moon, RotateCcw } from "lucide-react";

export default function SettingsPage() {
  const { theme, setTheme, resetData } = useAppStore();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-bold">Settings</h1>
        <p className="text-sm text-muted-foreground">Application preferences and demo controls</p>
      </div>

      {/* Theme */}
      <Card>
        <CardHeader>
          <CardTitle>Appearance</CardTitle>
          <CardDescription>Choose between light and dark theme</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-3">
            <button
              onClick={() => setTheme("dark")}
              className={`flex items-center gap-2 rounded-md border px-4 py-3 text-sm transition-colors ${
                theme === "dark"
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:bg-muted"
              }`}
              aria-pressed={theme === "dark"}
            >
              <Moon className="h-4 w-4" />
              Dark
            </button>
            <button
              onClick={() => setTheme("light")}
              className={`flex items-center gap-2 rounded-md border px-4 py-3 text-sm transition-colors ${
                theme === "light"
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:bg-muted"
              }`}
              aria-pressed={theme === "light"}
            >
              <Sun className="h-4 w-4" />
              Light
            </button>
          </div>
        </CardContent>
      </Card>

      <Separator />

      {/* Demo data */}
      <Card>
        <CardHeader>
          <CardTitle>Demo Data</CardTitle>
          <CardDescription>
            Reset all mock data to its initial state. This will revert any changes made during this
            session.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="destructive" onClick={resetData}>
            <RotateCcw className="h-4 w-4" />
            Reset Demo Data
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
