"use client";

import { Hero } from "@/components/home/Hero";
import { MomentsStrip } from "@/components/home/MomentsStrip";
import { RecentMatches } from "@/components/home/RecentMatches";
import { TrustReceipt } from "@/components/home/TrustReceipt";
import { BuilderFooter } from "@/components/home/BuilderFooter";

export default function HomePage() {
  return (
    <>
      <Hero />
      <MomentsStrip />
      <RecentMatches />
      <TrustReceipt />
      <BuilderFooter />
    </>
  );
}
