"use client";

import dynamic from "next/dynamic";

import PerfShell from "@/components/perf/PerfShell";

const ViteApp = dynamic(() => import("@/App"), {
  ssr: false,
  loading: () => <PerfShell headline="Preparing studio" />,
});

export function NextClientShell() {
  return <ViteApp />;
}
