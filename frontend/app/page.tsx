"use client";

import Link from "next/link";
import { redirect } from "next/navigation";
import { useEffect } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { DatasetCard, type DatasetCardData } from "@/components/dataset/DatasetCard";
import { ThemeToggle } from "@/components/ThemeToggle";
import { EVENTS, track } from "@/lib/analytics";
import { useAppConvexAuth } from "@/lib/app-auth";

const PUBLIC_GRID_COUNT = 6;

const FEATURES = [
  {
    title: "Live web watch",
    body: "TinyFish web agents search and read the live web to build and refresh every monitor — no stale CSVs.",
  },
  {
    title: "Change signals",
    body: "Save a baseline. Cortex diffs each fresh capture: new entries, missing entries, and every % move.",
  },
  {
    title: "Decision lab",
    body: "Weight what matters — price, capacity, reliability — and get an explainable, ranked shortlist.",
  },
  {
    title: "Evidence first",
    body: "Every recommendation links back to the pages the agents read. Export a Markdown decision brief in one click.",
  },
];

const PRESETS = [
  "GPU cloud providers with H100 hourly price, region, and availability",
  "Competitor SaaS pricing tiers with monthly price and seat limits",
  "Startup grants and credits in India with amount, deadline, and eligibility",
];

export default function Home() {
  const { isAuthenticated, isLoading } = useAppConvexAuth();
  const publicDatasets = useQuery(api.datasets.listPublic, {});

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      track(EVENTS.LANDING_PAGE_VIEWED);
    }
  }, [isLoading, isAuthenticated]);

  if (isAuthenticated) {
    redirect("/dashboard");
  }

  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-muted">Loading...</p>
      </div>
    );
  }

  const shownDatasets = (publicDatasets ?? []).slice(0, PUBLIC_GRID_COUNT);

  return (
    <div className="flex flex-1 flex-col">
      <section className="cortex-hero">
        <header className="relative z-10 mx-auto flex max-w-[1280px] items-center justify-between px-6 py-5">
          <span className="cortex-wordmark" style={{ color: "#e3f1dc" }}>
            <span className="cortex-radar-dot" aria-hidden="true" />
            Cortex
          </span>
          <div className="flex items-center gap-4">
            <ThemeToggle />
            <Link href="/sign-in" className="text-sm font-semibold text-[#e3f1dc]/80 hover:text-[#c6f432]">
              Sign in
            </Link>
          </div>
        </header>

        <div className="relative z-10 mx-auto max-w-[1280px] px-6 pb-24 pt-16 md:pt-24">
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#c6f432]">
            The live web decision desk · powered by TinyFish
          </p>
          <h1 className="mt-5 max-w-3xl text-5xl font-extrabold leading-[1.02] tracking-tight md:text-7xl">
            Know what changed.
            <br />
            <span className="lime">Decide what&apos;s next.</span>
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-[#e3f1dc]/75">
            Describe a market in plain English. TinyFish agents research it across the live web, Cortex watches it for
            changes, and ranks every option against your priorities — with sources attached.
          </p>
          <div className="mt-9 flex flex-wrap gap-3">
            <Link
              href="/sign-in"
              onClick={() => track(EVENTS.GET_STARTED_CLICKED)}
              className="rounded-xl bg-[#c6f432] px-6 py-3 text-sm font-extrabold text-[#06120c] transition-transform hover:-translate-y-0.5"
            >
              Start a monitor
            </Link>
            <a
              href="#explore"
              className="rounded-xl border border-[#c6f432]/40 px-6 py-3 text-sm font-bold text-[#e3f1dc] hover:border-[#c6f432]"
            >
              See live monitors
            </a>
          </div>
          <div className="mt-12 flex flex-wrap gap-2">
            {PRESETS.map((p) => (
              <span
                key={p}
                className="rounded-full border border-[#c6f432]/25 bg-[#c6f432]/[0.06] px-3 py-1.5 text-xs text-[#e3f1dc]/80"
              >
                “{p}”
              </span>
            ))}
          </div>
        </div>
      </section>

      <main className="flex-1">
        <section className="px-6 py-16">
          <div className="mx-auto grid max-w-[1280px] gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {FEATURES.map((f, i) => (
              <div key={f.title} className="cortex-feature">
                <span className="cortex-kicker">0{i + 1}</span>
                <b className="mt-2">{f.title}</b>
                <p className="text-sm leading-relaxed text-muted">{f.body}</p>
              </div>
            ))}
          </div>
        </section>

        <section id="explore" className="border-t border-border bg-surface/40 px-6 py-14">
          <div className="mx-auto max-w-[1280px]">
            <div className="mb-10">
              <p className="cortex-kicker">Live monitors</p>
              <h2 className="mt-2 text-[28px] font-extrabold leading-none tracking-tight">
                Markets Cortex is watching
              </h2>
              <p className="mt-3 max-w-lg text-sm text-muted">
                Refreshed automatically by TinyFish web agents — open one to rank options and see what changed.
              </p>
            </div>

            {publicDatasets === undefined ? (
              <SkeletonGrid count={PUBLIC_GRID_COUNT} />
            ) : shownDatasets.length === 0 ? (
              <div className="flex items-center justify-center rounded-2xl border border-dashed border-border py-20">
                <p className="text-sm text-muted">Sign in to create your first monitor.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {shownDatasets.map((ds) => (
                  <DatasetCard key={ds._id} dataset={ds as unknown as DatasetCardData} />
                ))}
              </div>
            )}
          </div>
        </section>
      </main>

      <footer className="border-t border-border px-6 py-6 text-center text-xs text-muted">
        Cortex by Team Cortex Sync · Web research by{" "}
        <a href="https://tinyfish.ai" className="text-link" target="_blank" rel="noreferrer">
          TinyFish
        </a>{" "}
        · Built on the open-source BigSet engine (AGPL-3.0)
      </footer>
    </div>
  );
}

function SkeletonGrid({ count }: { count: number }) {
  return (
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="h-[280px] animate-pulse rounded-2xl border border-border bg-surface" />
      ))}
    </div>
  );
}
