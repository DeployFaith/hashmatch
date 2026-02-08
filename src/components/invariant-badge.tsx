"use client";

import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ShieldCheck, ShieldAlert, ShieldQuestion } from "lucide-react";

interface InvariantBadgeProps {
  name: string;
  status: "pass" | "fail" | "unknown";
  message?: string;
  className?: string;
}

export function InvariantBadge({ name, status, message, className }: InvariantBadgeProps) {
  const Icon = status === "pass" ? ShieldCheck : status === "fail" ? ShieldAlert : ShieldQuestion;

  const variant = status === "pass" ? "success" : status === "fail" ? "destructive" : "secondary";

  const badge = (
    <Badge variant={variant} className={cn("gap-1 cursor-default", className)}>
      <Icon className="h-3 w-3" />
      {name}: {status.toUpperCase()}
    </Badge>
  );

  if (!message) {
    return badge;
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>{badge}</TooltipTrigger>
        <TooltipContent>
          <p>{message}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
