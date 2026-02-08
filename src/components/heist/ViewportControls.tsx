"use client";

import type { AgentVisual } from "@/arena/heist/types";

export interface ViewportSettings {
  showRoomLabels: boolean;
  showPatrolRoutes: boolean;
  showDoorLabels: boolean;
  fogMode: string; // "spectator" | agentId
}

export const DEFAULT_SETTINGS: ViewportSettings = {
  showRoomLabels: true,
  showPatrolRoutes: true,
  showDoorLabels: false,
  fogMode: "spectator",
};

export function ViewportControls({
  settings,
  onSettingsChange,
  agents,
}: {
  settings: ViewportSettings;
  onSettingsChange: (s: ViewportSettings) => void;
  agents: Record<string, AgentVisual>;
}) {
  const agentIds = Object.keys(agents).sort();

  return (
    <div className="absolute right-2 top-2 z-10 rounded-md border border-border bg-card/90 p-2 text-xs backdrop-blur-sm">
      <div className="mb-1 font-semibold text-muted-foreground uppercase tracking-wider text-[10px]">
        Debug
      </div>

      <label className="flex items-center gap-1.5 py-0.5 cursor-pointer">
        <input
          type="checkbox"
          checked={settings.showRoomLabels}
          onChange={(e) => onSettingsChange({ ...settings, showRoomLabels: e.target.checked })}
          className="h-3 w-3 accent-cyan-400"
        />
        <span className="text-foreground/80">Room labels</span>
      </label>

      <label className="flex items-center gap-1.5 py-0.5 cursor-pointer">
        <input
          type="checkbox"
          checked={settings.showPatrolRoutes}
          onChange={(e) => onSettingsChange({ ...settings, showPatrolRoutes: e.target.checked })}
          className="h-3 w-3 accent-cyan-400"
        />
        <span className="text-foreground/80">Patrol routes</span>
      </label>

      <label className="flex items-center gap-1.5 py-0.5 cursor-pointer">
        <input
          type="checkbox"
          checked={settings.showDoorLabels}
          onChange={(e) => onSettingsChange({ ...settings, showDoorLabels: e.target.checked })}
          className="h-3 w-3 accent-cyan-400"
        />
        <span className="text-foreground/80">Door labels</span>
      </label>

      <div className="mt-1 border-t border-border pt-1">
        <div className="text-[10px] text-muted-foreground mb-0.5">Fog</div>
        <select
          value={settings.fogMode}
          onChange={(e) => onSettingsChange({ ...settings, fogMode: e.target.value })}
          className="h-6 w-full rounded border border-border bg-card px-1 text-xs"
        >
          <option value="spectator">Spectator (union)</option>
          {agentIds.map((id) => (
            <option key={id} value={id}>
              {id}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
