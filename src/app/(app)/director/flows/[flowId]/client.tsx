"use client";

import { use } from "react";
import Link from "next/link";
import { useAppStore } from "@/lib/store";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { StateMachineViewer } from "@/components/state-machine-viewer";
import { CopyJsonButton } from "@/components/copy-json-button";
import { ArrowLeft, Zap, ShieldCheck } from "lucide-react";

export default function FlowDetailClient({ params }: { params: Promise<{ flowId: string }> }) {
  const { flowId } = use(params);
  const { getFlow } = useAppStore();

  const flow = getFlow(flowId);
  if (!flow) {
    return (
      <div className="space-y-4">
        <Link
          href="/director"
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Back to Director Console
        </Link>
        <p className="text-sm text-muted-foreground">Flow not found.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Link
        href="/director"
        className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Back to Director Console
      </Link>

      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-lg font-bold">{flow.name}</h1>
          <p className="text-sm text-muted-foreground">{flow.description}</p>
        </div>
        <CopyJsonButton data={flow} />
      </div>

      <Separator />

      {/* State Machine */}
      <Card>
        <CardHeader>
          <CardTitle>States & Transitions</CardTitle>
        </CardHeader>
        <CardContent>
          <StateMachineViewer states={flow.states} transitions={flow.transitions} />
        </CardContent>
      </Card>

      {/* Triggers */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-primary" />
            <CardTitle>Triggers</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {flow.triggers.map((trigger) => (
              <div key={trigger.id} className="rounded-md border border-border px-4 py-3 text-sm">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{trigger.name}</span>
                  <Badge variant="outline">{trigger.id}</Badge>
                </div>
                <div className="mt-1 space-y-1 text-xs text-muted-foreground">
                  <p>
                    <span className="font-medium text-foreground">Condition:</span>{" "}
                    <code className="rounded bg-muted px-1 py-0.5">{trigger.condition}</code>
                  </p>
                  <p>
                    <span className="font-medium text-foreground">Action:</span>{" "}
                    <code className="rounded bg-muted px-1 py-0.5">{trigger.action}</code>
                  </p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Invariants */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-primary" />
            <CardTitle>Invariants</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {flow.invariants.map((inv) => (
              <div key={inv.id} className="rounded-md border border-border px-4 py-3 text-sm">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{inv.name}</span>
                  <Badge
                    variant={
                      inv.severity === "critical"
                        ? "destructive"
                        : inv.severity === "error"
                          ? "destructive"
                          : "warning"
                    }
                  >
                    {inv.severity}
                  </Badge>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{inv.description}</p>
                <p className="mt-1 text-xs">
                  <span className="text-muted-foreground">Expression:</span>{" "}
                  <code className="rounded bg-muted px-1 py-0.5">{inv.expression}</code>
                </p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
