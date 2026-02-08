import AgentDetailClient from "./client";

/** All data is loaded client-side from Zustand; no paths to pre-render. */
export function generateStaticParams() {
  return [];
}

export default function AgentDetailPage({ params }: { params: Promise<{ agentId: string }> }) {
  return <AgentDetailClient params={params} />;
}
