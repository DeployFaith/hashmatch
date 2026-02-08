import { headers } from "next/headers";
import MatchesClient from "./matches-client";
import type { MatchListItem } from "@/lib/matches/types";

async function fetchMatches(): Promise<MatchListItem[]> {
  const headersList = await headers();
  const host = headersList.get("x-forwarded-host") ?? headersList.get("host");
  if (!host) {
    return [];
  }
  const protocol = headersList.get("x-forwarded-proto") ?? "http";

  try {
    const response = await fetch(`${protocol}://${host}/api/matches`, {
      cache: "no-store",
    });
    if (!response.ok) {
      return [];
    }
    const data = (await response.json()) as MatchListItem[];
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

export default async function MatchesPage() {
  const matches = await fetchMatches();
  return <MatchesClient matches={matches} />;
}
