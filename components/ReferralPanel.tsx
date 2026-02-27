"use client";

import { useMemo, useState } from "react";
import { FaCheckCircle, FaCopy, FaUsers } from "react-icons/fa";
import { useToast } from "@/components/ToastProvider";

type ReferralSeriesPoint = {
  date: string;
  count: number;
};

type ReferralPanelProps = {
  referralCode: string;
  referralLink: string;
  referralCount: number;
  referralBonusDaily: number;
  dailySeries: ReferralSeriesPoint[];
};

type RangeKey = "1D" | "7D" | "1M" | "6M" | "1Y";

const rangeDays: Record<RangeKey, number> = {
  "1D": 1,
  "7D": 7,
  "1M": 30,
  "6M": 180,
  "1Y": 365,
};

function formatDateLabel(value: string) {
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat("id-ID", { day: "2-digit", month: "short" }).format(date);
}

function dateToIsoDay(date: Date) {
  return date.toISOString().slice(0, 10);
}

export default function ReferralPanel({
  referralCode,
  referralLink,
  referralCount,
  referralBonusDaily,
  dailySeries,
}: ReferralPanelProps) {
  const toast = useToast();
  const [copied, setCopied] = useState(false);
  const [range, setRange] = useState<RangeKey>("7D");

  const chartSeries = useMemo(() => {
    const days = rangeDays[range];
    const sourceMap = new Map(dailySeries.map((item) => [item.date, item.count]));
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    const filled: ReferralSeriesPoint[] = [];
    for (let index = days - 1; index >= 0; index -= 1) {
      const day = new Date(today);
      day.setUTCDate(today.getUTCDate() - index);
      const key = dateToIsoDay(day);
      filled.push({
        date: key,
        count: sourceMap.get(key) || 0,
      });
    }
    return filled;
  }, [dailySeries, range]);

  const maxValue = Math.max(1, ...chartSeries.map((point) => point.count));
  const totalInRange = chartSeries.reduce((sum, point) => sum + point.count, 0);

  const linePoints = chartSeries
    .map((point, index) => {
      const x = chartSeries.length === 1 ? 0 : (index / (chartSeries.length - 1)) * 100;
      const y = 100 - (point.count / maxValue) * 100;
      return `${x},${y}`;
    })
    .join(" ");

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(referralLink);
      setCopied(true);
      toast.success("Referral link berhasil dicopy.", "Copied");
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
      toast.error("Gagal copy referral link.", "Copy failed");
    }
  };

  const firstPoint = chartSeries[0];
  const middlePoint = chartSeries[Math.floor(chartSeries.length / 2)];
  const lastPoint = chartSeries[chartSeries.length - 1];

  return (
    <section className="space-y-4 rounded-2xl border border-zinc-200 bg-white/80 p-6 dark:border-zinc-800/80 dark:bg-zinc-900/70">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">Referral Program</h3>
          <p className="mt-1 text-sm text-zinc-500">
            Bagikan link referral. Setiap member valid memberi bonus limit +250/hari.
          </p>
        </div>
        <span className="inline-flex items-center gap-2 rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
          <FaUsers className="text-xs" />
          {referralCount} referrals
        </span>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <article className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-950/70">
          <p className="text-xs uppercase tracking-wide text-zinc-500">Your referral code</p>
          <p className="mt-1 text-base font-semibold text-zinc-900 dark:text-zinc-100">{referralCode}</p>
        </article>
        <article className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-950/70">
          <p className="text-xs uppercase tracking-wide text-zinc-500">Bonus daily limit</p>
          <p className="mt-1 text-base font-semibold text-zinc-900 dark:text-zinc-100">
            +{referralBonusDaily} requests/day
          </p>
        </article>
      </div>

      <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-950/70">
        <p className="text-xs uppercase tracking-wide text-zinc-500">Referral link</p>
        <div className="mt-2 flex flex-col gap-3 md:flex-row md:items-center">
          <code className="block flex-1 overflow-x-auto rounded-lg bg-zinc-100 px-3 py-2 text-xs text-zinc-800 dark:bg-zinc-900 dark:text-zinc-200">
            {referralLink}
          </code>
          <button
            type="button"
            onClick={handleCopy}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-zinc-900 px-4 text-sm font-medium text-white transition-colors hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
          >
            {copied ? <FaCheckCircle className="text-sm" /> : <FaCopy className="text-sm" />}
            {copied ? "Copied" : "Copy Link"}
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-950/70">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Referral Statistics</p>
            <p className="text-xs text-zinc-500">Total masuk pada range ini: {totalInRange}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {(Object.keys(rangeDays) as RangeKey[]).map((rangeKey) => (
              <button
                key={rangeKey}
                type="button"
                onClick={() => setRange(rangeKey)}
                className={[
                  "h-8 rounded-md px-2.5 text-xs font-medium transition-colors",
                  range === rangeKey
                    ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                    : "border border-zinc-300 text-zinc-700 hover:bg-zinc-200 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800",
                ].join(" ")}
              >
                {rangeKey}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-4 h-52 rounded-lg border border-zinc-200 bg-zinc-100/70 p-3 dark:border-zinc-800 dark:bg-zinc-900/80">
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-full w-full">
            <line x1="0" y1="100" x2="100" y2="100" stroke="rgb(113 113 122)" strokeWidth="0.6" />
            <line x1="0" y1="66" x2="100" y2="66" stroke="rgb(113 113 122 / 0.6)" strokeWidth="0.4" />
            <line x1="0" y1="33" x2="100" y2="33" stroke="rgb(113 113 122 / 0.45)" strokeWidth="0.4" />

            {chartSeries.length > 1 ? (
              <polyline
                points={linePoints}
                fill="none"
                stroke="rgb(16 185 129)"
                strokeWidth="1.6"
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            ) : null}

            {chartSeries.map((point, index) => {
              const x = chartSeries.length === 1 ? 0 : (index / (chartSeries.length - 1)) * 100;
              const y = 100 - (point.count / maxValue) * 100;
              return <circle key={point.date} cx={x} cy={y} r="1.2" fill="rgb(16 185 129)" />;
            })}
          </svg>
        </div>

        <div className="mt-2 flex items-center justify-between text-[11px] text-zinc-500">
          <span>{firstPoint ? formatDateLabel(firstPoint.date) : "-"}</span>
          <span>{middlePoint ? formatDateLabel(middlePoint.date) : "-"}</span>
          <span>{lastPoint ? formatDateLabel(lastPoint.date) : "-"}</span>
        </div>
      </div>
    </section>
  );
}
