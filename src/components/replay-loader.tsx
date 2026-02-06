"use client";

import { useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Upload, FileText, Loader2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { useAppStore } from "@/lib/store";

export function ReplayLoader() {
  const router = useRouter();
  const { loadReplay } = useAppStore();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const handleLoad = useCallback(
    (jsonl: string, filename: string) => {
      setLoading(true);
      setError(null);

      try {
        const result = loadReplay(jsonl);

        if (!result.matchId) {
          setError(
            result.errors.length > 0
              ? result.errors.join("\n")
              : "Failed to parse replay file",
          );
          setLoading(false);
          return;
        }

        if (result.errors.length > 0) {
          // Partial success - loaded with warnings
          // eslint-disable-next-line no-console
          console.warn(`Replay ${filename} loaded with warnings:`, result.errors);
        }

        router.push(`/matches/${result.matchId}`);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error loading replay");
        setLoading(false);
      }
    },
    [loadReplay, router],
  );

  const handleFileSelect = useCallback(
    (file: File) => {
      if (!file.name.endsWith(".jsonl")) {
        setError("Please select a .jsonl file");
        return;
      }

      const reader = new FileReader();
      reader.onload = (e) => {
        const text = e.target?.result;
        if (typeof text === "string") {
          handleLoad(text, file.name);
        }
      };
      reader.onerror = () => {
        setError("Failed to read file");
      };
      reader.readAsText(file);
    },
    [handleLoad],
  );

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        handleFileSelect(file);
      }
    },
    [handleFileSelect],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) {
        handleFileSelect(file);
      }
    },
    [handleFileSelect],
  );

  const handleLoadSample = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const resp = await fetch("/replays/number-guess-demo.jsonl");
      if (!resp.ok) {
        throw new Error(`Failed to fetch sample: ${resp.status}`);
      }
      const text = await resp.text();
      handleLoad(text, "number-guess-demo.jsonl");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load sample replay");
      setLoading(false);
    }
  }, [handleLoad]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Load Replay</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Drag & drop zone */}
        <div
          className={`flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-8 transition-colors ${
            dragOver
              ? "border-primary bg-primary/5"
              : "border-border hover:border-muted-foreground/50"
          }`}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
        >
          <Upload className="mb-2 h-8 w-8 text-muted-foreground" />
          <p className="mb-1 text-sm font-medium">Drop a .jsonl replay file here</p>
          <p className="mb-3 text-xs text-muted-foreground">
            or click below to browse
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept=".jsonl"
            onChange={handleInputChange}
            className="hidden"
          />
          <Button
            variant="outline"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            disabled={loading}
          >
            <FileText className="h-4 w-4" />
            Choose file
          </Button>
        </div>

        {/* Sample replay button */}
        <div className="flex items-center gap-3">
          <div className="h-px flex-1 bg-border" />
          <span className="text-xs text-muted-foreground">or</span>
          <div className="h-px flex-1 bg-border" />
        </div>

        <Button
          variant="secondary"
          className="w-full"
          onClick={handleLoadSample}
          disabled={loading}
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <FileText className="h-4 w-4" />
          )}
          Load sample replay (Number Guess)
        </Button>

        {/* Error display */}
        {error && (
          <div className="flex items-start gap-2 rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <pre className="whitespace-pre-wrap font-mono text-xs">{error}</pre>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
