"use client";

import Link from "next/link";
import { useAppStore } from "@/lib/store";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Workflow, ShieldCheck, Zap, GitBranch } from "lucide-react";

export default function DirectorPage() {
  const { flows } = useAppStore();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-bold">System Director Console</h1>
        <p className="text-sm text-muted-foreground">
          Inspect flows, rules, invariants, and state transitions
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {flows.map((flow) => (
          <Link key={flow.id} href={`/director/flows/${flow.id}`}>
            <Card className="transition-colors hover:border-primary/50">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Workflow className="h-5 w-5 text-primary" />
                  <CardTitle>{flow.name}</CardTitle>
                </div>
                <CardDescription>{flow.description}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                  <div className="flex items-center gap-1">
                    <GitBranch className="h-3.5 w-3.5" />
                    {flow.states.length} states
                  </div>
                  <div className="flex items-center gap-1">
                    <Zap className="h-3.5 w-3.5" />
                    {flow.triggers.length} triggers
                  </div>
                  <div className="flex items-center gap-1">
                    <ShieldCheck className="h-3.5 w-3.5" />
                    {flow.invariants.length} invariants
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-1">
                  {flow.states.map((state) => (
                    <Badge key={state.id} variant="outline" className="text-xs">
                      {state.name}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      {flows.length === 0 && (
        <div className="flex items-center justify-center rounded-lg border border-border p-8 text-sm text-muted-foreground">
          No flows defined.
        </div>
      )}
    </div>
  );
}
