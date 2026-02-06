import { Badge } from "@/components/ui/badge";
import type { MatchStatus } from "@/lib/models";

const statusConfig: Record<
  MatchStatus,
  { label: string; variant: "success" | "info" | "warning" | "destructive" | "secondary" }
> = {
  scheduled: { label: "Scheduled", variant: "secondary" },
  in_progress: { label: "In Progress", variant: "info" },
  completed: { label: "Completed", variant: "success" },
  cancelled: { label: "Cancelled", variant: "warning" },
  error: { label: "Error", variant: "destructive" },
};

interface MatchStatusBadgeProps {
  status: MatchStatus;
  className?: string;
}

export function MatchStatusBadge({ status, className }: MatchStatusBadgeProps) {
  const config = statusConfig[status];
  return (
    <Badge variant={config.variant} className={className}>
      {config.label}
    </Badge>
  );
}
