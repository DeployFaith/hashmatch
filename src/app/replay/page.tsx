import { Suspense } from "react";
import ReplayPageClient from "./replay-page-client";

export default function ReplayPage() {
  return (
    <Suspense fallback={<div className="min-h-screen" />}>
      <ReplayPageClient />
    </Suspense>
  );
}
