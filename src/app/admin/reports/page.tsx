"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";

type KpiRow = {
  total_events: number;
  pageviews: number;
  utms_generated: number;
  links_shortened: number;
  ai_posts_generated: number;
  enrichments_saved: number;
  quota_blocks: number;
};

type DailyPageview = { day: string; views: number };
type EventVolumeRow = { event: string; cnt: number };
type LookupByRepRow = { rep: string | null; lookups: number };
type LookupByResultRow = { result: string | null; cnt: number };
type EnrichmentOutcomeRow = {
  kind: string | null;
  outcome: string | null;
  cnt: number;
};
type EnrichmentHitRateRow = {
  kind: string | null;
  started: number;
  found: number;
  saved: number;
};
type QuotaBlockRow = { rep: string | null; blocks: number };
type UtmByRepRow = {
  rep: string | null;
  page: string | null;
  cnt: number;
};
type EventCountRow = { event: string; cnt: number };
type TopPageRow = { url: string | null; views: number };
type DistinctContactsRow = { unique_contacts: number };

type ReportsPayload = {
  data: {
    kpis?: KpiRow[];
    distinctContacts?: DistinctContactsRow[];
    dailyPageviews?: DailyPageview[];
    eventVolume?: EventVolumeRow[];
    lookupsByRep?: LookupByRepRow[];
    lookupsByResult?: LookupByResultRow[];
    enrichmentOutcomes?: EnrichmentOutcomeRow[];
    enrichmentHitRate?: EnrichmentHitRateRow[];
    quotaBlocksByRep?: QuotaBlockRow[];
    utmsByRep?: UtmByRepRow[];
    contentHubActivity?: EventCountRow[];
    emailHubActivity?: EventCountRow[];
    assetHubActivity?: EventCountRow[];
    topPages?: TopPageRow[];
  };
  errors: Record<string, string>;
  window: string;
};

function nf(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  return Intl.NumberFormat().format(n);
}

function pct(num: number, denom: number): string {
  if (!denom) return "—";
  return `${Math.round((num / denom) * 100)}%`;
}

function formatDay(day: string): string {
  const d = new Date(day);
  if (!Number.isFinite(d.getTime())) return day;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function Tile({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <div className="text-xs uppercase tracking-wide text-gray-500">
        {label}
      </div>
      <div className="mt-1 text-2xl font-semibold text-gray-900">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-gray-500">{sub}</div>}
    </div>
  );
}

function Section({
  title,
  children,
  error,
}: {
  title: string;
  children: React.ReactNode;
  error?: string;
}) {
  return (
    <section className="mt-8">
      <h2 className="mb-3 text-lg font-semibold text-gray-900">{title}</h2>
      {error ? (
        <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      ) : (
        children
      )}
    </section>
  );
}

function SimpleTable({
  headers,
  rows,
  empty = "No data in window.",
}: {
  headers: string[];
  rows: (string | number)[][];
  empty?: string;
}) {
  if (rows.length === 0) {
    return <div className="text-sm text-gray-500">{empty}</div>;
  }
  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
      <table className="min-w-full text-sm">
        <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
          <tr>
            {headers.map((h) => (
              <th key={h} className="px-3 py-2 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 text-gray-900">
          {rows.map((row, i) => (
            <tr key={i}>
              {row.map((cell, j) => (
                <td key={j} className="px-3 py-2">
                  {cell ?? "—"}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function ReportsPage() {
  const [loading, setLoading] = useState(true);
  const [unauthorized, setUnauthorized] = useState(false);
  const [configMissing, setConfigMissing] = useState(false);
  const [fatalError, setFatalError] = useState<string | null>(null);
  const [payload, setPayload] = useState<ReportsPayload | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const res = await fetch("/api/admin/reports", { cache: "no-store" });
        if (res.status === 401) {
          if (!cancelled) setUnauthorized(true);
          return;
        }
        if (res.status === 503) {
          if (!cancelled) setConfigMissing(true);
          return;
        }
        const data = (await res.json()) as ReportsPayload;
        if (!res.ok) {
          if (!cancelled) {
            const message =
              (data as unknown as { error?: string }).error ||
              `Request failed: ${res.status}`;
            setFatalError(message);
          }
          return;
        }
        if (!cancelled) setPayload(data);
      } catch (err) {
        if (!cancelled) {
          setFatalError(err instanceof Error ? err.message : "Request failed");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  if (unauthorized) {
    return (
      <div className="min-h-screen bg-gray-50 px-4 pt-8 pb-16">
        <div className="mx-auto max-w-[600px]">
          <h1 className="text-2xl font-semibold text-gray-900">
            Reports
          </h1>
          <p className="mt-4 text-gray-700">
            You need to sign in first.{" "}
            <Link href="/admin" className="text-blue-600 hover:text-blue-800">
              Go to admin sign-in →
            </Link>
          </p>
        </div>
      </div>
    );
  }

  if (configMissing) {
    return (
      <div className="min-h-screen bg-gray-50 px-4 pt-8 pb-16">
        <div className="mx-auto max-w-[700px]">
          <h1 className="text-2xl font-semibold text-gray-900">Reports</h1>
          <div className="mt-4 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
            <p className="font-medium">PostHog not configured.</p>
            <p className="mt-1">
              Set <code className="rounded bg-amber-100 px-1">POSTHOG_PERSONAL_API_KEY</code>{" "}
              and{" "}
              <code className="rounded bg-amber-100 px-1">POSTHOG_PROJECT_ID</code>{" "}
              in Vercel env vars, then redeploy.
            </p>
            <p className="mt-2">
              The personal API key is created at{" "}
              <em>PostHog → Settings → Personal API Keys</em> with{" "}
              <em>query:read</em> scope. Project ID is in the URL of your
              PostHog project ({"/project/<id>/..."}).
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 px-4 pt-8 pb-16">
        <div className="mx-auto max-w-[1100px]">
          <h1 className="text-2xl font-semibold text-gray-900">Reports</h1>
          <p className="mt-4 text-gray-500">Loading PostHog data…</p>
        </div>
      </div>
    );
  }

  if (fatalError) {
    return (
      <div className="min-h-screen bg-gray-50 px-4 pt-8 pb-16">
        <div className="mx-auto max-w-[700px]">
          <h1 className="text-2xl font-semibold text-gray-900">Reports</h1>
          <div className="mt-4 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {fatalError}
          </div>
        </div>
      </div>
    );
  }

  if (!payload) return null;

  const kpi = payload.data.kpis?.[0];
  const uniqueContacts =
    payload.data.distinctContacts?.[0]?.unique_contacts ?? 0;
  const daily = payload.data.dailyPageviews ?? [];
  const eventVolume = payload.data.eventVolume ?? [];
  const lookupsByRep = payload.data.lookupsByRep ?? [];
  const lookupsByResult = payload.data.lookupsByResult ?? [];
  const enrichmentOutcomes = payload.data.enrichmentOutcomes ?? [];
  const enrichmentHitRate = payload.data.enrichmentHitRate ?? [];
  const quotaBlocksByRep = payload.data.quotaBlocksByRep ?? [];
  const utmsByRep = payload.data.utmsByRep ?? [];
  const contentHub = payload.data.contentHubActivity ?? [];
  const emailHub = payload.data.emailHubActivity ?? [];
  const assetHub = payload.data.assetHubActivity ?? [];
  const topPages = payload.data.topPages ?? [];

  const errs = payload.errors;

  return (
    <div className="min-h-screen bg-gray-50 px-4 pt-8 pb-16">
      <div className="mx-auto max-w-[1100px]">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Reports</h1>
            <p className="text-sm text-gray-500">
              Last 30 days · PostHog ({payload.window})
            </p>
          </div>
          <Link
            href="/admin"
            className="text-sm text-blue-600 hover:text-blue-800"
          >
            ← Admin
          </Link>
        </div>

        {/* KPI tiles */}
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Tile
            label="Total events"
            value={nf(kpi?.total_events)}
            sub="excl. $pageview / $pageleave"
          />
          <Tile label="Pageviews" value={nf(kpi?.pageviews)} />
          <Tile
            label="Unique contacts"
            value={nf(uniqueContacts)}
            sub="distinct HXT IDs looked up"
          />
          <Tile
            label="UTMs generated"
            value={nf(kpi?.utms_generated)}
            sub={`${nf(kpi?.links_shortened)} shortened`}
          />
          <Tile
            label="AI posts"
            value={nf(kpi?.ai_posts_generated)}
            sub="generated"
          />
          <Tile
            label="Enrichments saved"
            value={nf(kpi?.enrichments_saved)}
            sub="to Ortto"
          />
          <Tile
            label="Quota blocks"
            value={nf(kpi?.quota_blocks)}
            sub="phone enrich refused"
          />
        </div>

        {/* Daily pageviews chart */}
        <Section title="Daily pageviews" error={errs.dailyPageviews}>
          <div className="rounded-lg border border-gray-200 bg-white p-3">
            <div style={{ width: "100%", height: 240 }}>
              <ResponsiveContainer>
                <LineChart data={daily}>
                  <CartesianGrid stroke="#f1f5f9" strokeDasharray="3 3" />
                  <XAxis
                    dataKey="day"
                    tickFormatter={formatDay}
                    fontSize={11}
                    stroke="#94a3b8"
                  />
                  <YAxis fontSize={11} stroke="#94a3b8" allowDecimals={false} />
                  <Tooltip
                    labelFormatter={(d) => formatDay(String(d))}
                    contentStyle={{ fontSize: 12 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="views"
                    stroke="#2563eb"
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </Section>

        {/* Marketing Contact */}
        <h2 className="mt-10 border-b border-gray-200 pb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
          Marketing Contact
        </h2>

        <Section title="Lookups by rep" error={errs.lookupsByRep}>
          <SimpleTable
            headers={["Rep", "Lookups"]}
            rows={lookupsByRep.map((r) => [r.rep ?? "(unknown)", nf(r.lookups)])}
          />
        </Section>

        <Section title="Lookups by result" error={errs.lookupsByResult}>
          <SimpleTable
            headers={["Result", "Count"]}
            rows={lookupsByResult.map((r) => [r.result ?? "(unknown)", nf(r.cnt)])}
          />
        </Section>

        <Section
          title="Enrichment hit rate by kind"
          error={errs.enrichmentHitRate}
        >
          <SimpleTable
            headers={["Kind", "Started", "Found", "Saved", "Hit rate", "Save rate"]}
            rows={enrichmentHitRate.map((r) => [
              r.kind ?? "(unknown)",
              nf(r.started),
              nf(r.found),
              nf(r.saved),
              pct(r.found, r.started),
              pct(r.saved, r.found),
            ])}
          />
        </Section>

        <Section
          title="Enrichment outcomes breakdown"
          error={errs.enrichmentOutcomes}
        >
          <SimpleTable
            headers={["Kind", "Outcome", "Count"]}
            rows={enrichmentOutcomes.map((r) => [
              r.kind ?? "(unknown)",
              r.outcome ?? "(unknown)",
              nf(r.cnt),
            ])}
          />
        </Section>

        <Section title="Quota blocks by rep" error={errs.quotaBlocksByRep}>
          <SimpleTable
            headers={["Rep", "Blocks"]}
            rows={quotaBlocksByRep.map((r) => [r.rep ?? "(unknown)", nf(r.blocks)])}
            empty="No quota blocks in window."
          />
        </Section>

        {/* Link Builder + Content Hub */}
        <h2 className="mt-10 border-b border-gray-200 pb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
          Link Builder & Content Hub
        </h2>

        <Section title="UTMs generated by rep & page" error={errs.utmsByRep}>
          <SimpleTable
            headers={["Rep", "Page", "UTMs"]}
            rows={utmsByRep.map((r) => [
              r.rep ?? "(none)",
              r.page ?? "(unknown)",
              nf(r.cnt),
            ])}
          />
        </Section>

        <Section title="Content Hub activity" error={errs.contentHubActivity}>
          <SimpleTable
            headers={["Event", "Count"]}
            rows={contentHub.map((r) => [r.event, nf(r.cnt)])}
          />
        </Section>

        {/* Hubs */}
        <h2 className="mt-10 border-b border-gray-200 pb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
          Email Hub & Asset Hub
        </h2>

        <Section title="Email Hub activity" error={errs.emailHubActivity}>
          <SimpleTable
            headers={["Event", "Count"]}
            rows={emailHub.map((r) => [r.event, nf(r.cnt)])}
          />
        </Section>

        <Section title="Asset Hub activity" error={errs.assetHubActivity}>
          <SimpleTable
            headers={["Event", "Count"]}
            rows={assetHub.map((r) => [r.event, nf(r.cnt)])}
          />
        </Section>

        {/* Traffic */}
        <h2 className="mt-10 border-b border-gray-200 pb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
          Traffic
        </h2>

        <Section title="Top pages" error={errs.topPages}>
          <SimpleTable
            headers={["URL", "Views"]}
            rows={topPages.map((r) => [r.url ?? "(unknown)", nf(r.views)])}
          />
        </Section>

        <Section title="All custom events" error={errs.eventVolume}>
          <SimpleTable
            headers={["Event", "Count"]}
            rows={eventVolume.map((r) => [r.event, nf(r.cnt)])}
          />
        </Section>
      </div>
    </div>
  );
}
