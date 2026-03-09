"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  FaBullhorn,
  FaCheckCircle,
  FaExclamationTriangle,
  FaInfoCircle,
  FaTimes,
  FaTools,
} from "react-icons/fa";

import type { DashboardAnnouncement } from "@/lib/announcements";

type AnnouncementState = DashboardAnnouncement & {
  phase: "entering" | "visible" | "leaving";
};

type DashboardAnnouncementsProps = {
  announcements: DashboardAnnouncement[];
};

const DISMISS_PREFIX = "jzrestapi:announcement";

const toneStyles: Record<
  DashboardAnnouncement["tone"],
  {
    icon: typeof FaInfoCircle;
    badgeClass: string;
    cardClass: string;
    iconClass: string;
  }
> = {
  INFO: {
    icon: FaInfoCircle,
    badgeClass: "border-sky-500/30 bg-sky-500/12 text-sky-400",
    cardClass: "border-sky-500/20 bg-sky-500/10",
    iconClass: "text-sky-400",
  },
  UPDATE: {
    icon: FaBullhorn,
    badgeClass: "border-emerald-500/30 bg-emerald-500/12 text-emerald-400",
    cardClass: "border-emerald-500/20 bg-emerald-500/10",
    iconClass: "text-emerald-400",
  },
  WARNING: {
    icon: FaExclamationTriangle,
    badgeClass: "border-amber-500/30 bg-amber-500/12 text-amber-400",
    cardClass: "border-amber-500/20 bg-amber-500/10",
    iconClass: "text-amber-400",
  },
  CRITICAL: {
    icon: FaTools,
    badgeClass: "border-rose-500/30 bg-rose-500/12 text-rose-400",
    cardClass: "border-rose-500/20 bg-rose-500/10",
    iconClass: "text-rose-400",
  },
};

function getDismissKey(announcement: Pick<DashboardAnnouncement, "id" | "version">) {
  return `${DISMISS_PREFIX}:${announcement.id}:v${announcement.version}`;
}

export default function DashboardAnnouncements({
  announcements,
}: DashboardAnnouncementsProps) {
  const [items, setItems] = useState<AnnouncementState[]>([]);
  const [ready, setReady] = useState(false);
  const dismissTimersRef = useRef<number[]>([]);

  const orderedAnnouncements = useMemo(() => announcements.slice(0, 2), [announcements]);

  useEffect(() => {
    return () => {
      dismissTimersRef.current.forEach((timer) => window.clearTimeout(timer));
      dismissTimersRef.current = [];
    };
  }, []);

  useEffect(() => {
    if (orderedAnnouncements.length === 0) {
      setItems([]);
      setReady(true);
      return;
    }

    const visible = orderedAnnouncements.filter((announcement) => {
      try {
        return localStorage.getItem(getDismissKey(announcement)) !== "1";
      } catch {
        return true;
      }
    });

    setItems(visible.map((announcement) => ({ ...announcement, phase: "entering" })));
    setReady(true);

    if (visible.length === 0) {
      return;
    }

    const timers = visible.map((announcement, index) =>
      window.setTimeout(() => {
        setItems((current) =>
          current.map((item) =>
            item.id === announcement.id ? { ...item, phase: "visible" } : item,
          ),
        );
      }, 40 + index * 70),
    );

    return () => {
      timers.forEach((timer) => window.clearTimeout(timer));
    };
  }, [orderedAnnouncements]);

  const dismissAnnouncement = (announcement: DashboardAnnouncement) => {
    try {
      localStorage.setItem(getDismissKey(announcement), "1");
    } catch {}

    setItems((current) =>
      current.map((item) =>
        item.id === announcement.id ? { ...item, phase: "leaving" } : item,
      ),
    );

    const timer = window.setTimeout(() => {
      setItems((current) => current.filter((item) => item.id !== announcement.id));
    }, 220);
    dismissTimersRef.current.push(timer);
  };

  if (!ready || items.length === 0) {
    return null;
  }

  return (
    <section className="space-y-3" aria-label="Dashboard announcements">
      {items.map((announcement, index) => {
        const tone = toneStyles[announcement.tone];
        const ToneIcon = tone.icon;
        const animationClass =
          announcement.phase === "leaving" ? "dashboard-announcement-out" : "dashboard-announcement-in";

        return (
          <article
            key={`${announcement.id}-${announcement.version}`}
            className={[
              "rounded-2xl border p-4 shadow-sm shadow-black/10",
              "backdrop-blur-sm",
              tone.cardClass,
              animationClass,
            ].join(" ")}
            style={
              announcement.phase === "leaving"
                ? undefined
                : { animationDelay: `${index * 80}ms` }
            }
          >
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={["inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em]", tone.badgeClass].join(" ")}>
                    <ToneIcon className={tone.iconClass} />
                    {announcement.badgeLabel || announcement.tone}
                  </span>
                  {announcement.isDismissible ? (
                    <span className="inline-flex items-center gap-1 rounded-full border border-zinc-700/80 bg-zinc-950/50 px-2 py-1 text-[11px] font-medium text-zinc-400">
                      <FaCheckCircle className="text-[10px]" />
                      Dismissible
                    </span>
                  ) : null}
                </div>

                <h3 className="mt-3 text-base font-semibold text-zinc-100 md:text-lg">
                  {announcement.title}
                </h3>
                <p className="mt-1 max-w-3xl text-sm leading-relaxed text-zinc-300">
                  {announcement.message}
                </p>
              </div>

              <div className="flex shrink-0 flex-col items-stretch gap-2 sm:flex-row md:flex-col">
                {announcement.ctaLabel && announcement.ctaHref ? (
                  <Link
                    href={announcement.ctaHref}
                    className="inline-flex h-10 items-center justify-center rounded-lg bg-zinc-100 px-4 text-sm font-medium text-zinc-900 transition-colors hover:bg-white"
                  >
                    {announcement.ctaLabel}
                  </Link>
                ) : null}

                {announcement.isDismissible ? (
                  <button
                    type="button"
                    onClick={() => dismissAnnouncement(announcement)}
                    className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-zinc-700 bg-zinc-950/60 px-4 text-sm font-medium text-zinc-200 transition-colors hover:border-zinc-600 hover:bg-zinc-900"
                  >
                    <FaTimes className="text-xs" />
                    Don't show again
                  </button>
                ) : null}
              </div>
            </div>
          </article>
        );
      })}
    </section>
  );
}
