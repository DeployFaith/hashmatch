import FlowDetailClient from "./client";

/** All data is loaded client-side from Zustand; no paths to pre-render. */
export function generateStaticParams() {
  return [];
}

export default function FlowDetailPage({
  params,
}: {
  params: Promise<{ flowId: string }>;
}) {
  return <FlowDetailClient params={params} />;
}
