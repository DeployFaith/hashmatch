export type FailureModeId = `FM-${string}`;

export type DetectorSource = "core" | `scenario:${string}`;

export interface FailureModeHit {
  id: FailureModeId;
  count: number;
  rate?: number;
  detectorSource: DetectorSource;
}

export interface FailureModeProfile {
  byAgentId: Record<string, FailureModeHit[]>;
  fmClassifierVersion: string;
}
