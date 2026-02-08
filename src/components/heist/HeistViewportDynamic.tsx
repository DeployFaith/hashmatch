"use client";

import dynamic from "next/dynamic";
import type { HeistSceneState } from "@/arena/heist/types";

const HeistViewportInner = dynamic(
  () => import("./HeistViewport").then((mod) => ({ default: mod.HeistViewport })),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full w-full items-center justify-center bg-[#0a0a14] text-sm text-muted-foreground">
        Loading 3D viewport...
      </div>
    ),
  },
);

/**
 * SSR-safe wrapper around HeistViewport. Uses next/dynamic with ssr:false
 * so the R3F canvas is never rendered server-side.
 */
export function HeistViewportDynamic({ scene }: { scene: HeistSceneState }) {
  return <HeistViewportInner scene={scene} />;
}
