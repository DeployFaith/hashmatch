import MatchDetailClient from "./client";

/** All data is loaded client-side from Zustand; no paths to pre-render. */
export function generateStaticParams() {
  return [];
}

export default function MatchDetailPage({
  params,
}: {
  params: Promise<{ matchId: string }>;
}) {
  return <MatchDetailClient params={params} />;
}
