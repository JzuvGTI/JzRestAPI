"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  FaArchive,
  FaBullhorn,
  FaClock,
  FaEye,
  FaInfoCircle,
  FaThumbtack,
} from "react-icons/fa";

import Button from "@/components/Button";

type AnnouncementTone = "INFO" | "UPDATE" | "WARNING" | "CRITICAL";
type AnnouncementStatus = "DRAFT" | "PUBLISHED" | "ARCHIVED";
type AnnouncementAudience = "ALL" | "FREE" | "PAID" | "RESELLER" | "SUPERADMIN";

type AdminAnnouncement = {
  id: string;
  title: string;
  message: string;
  tone: AnnouncementTone;
  status: AnnouncementStatus;
  audience: AnnouncementAudience;
  badgeLabel: string | null;
  ctaLabel: string | null;
  ctaHref: string | null;
  priority: number;
  isPinned: boolean;
  isDismissible: boolean;
  startsAt: string | null;
  endsAt: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
  createdBy: {
    id: string;
    email: string;
    name: string | null;
  };
};

type AdminAnnouncementSummary = {
  total: number;
  active: number;
  scheduled: number;
  expired: number;
  pinned: number;
};

type AdminAnnouncementsResponse = {
  announcements: AdminAnnouncement[];
  summary: AdminAnnouncementSummary;
};

type DraftForm = {
  title: string;
  message: string;
  tone: AnnouncementTone;
  status: AnnouncementStatus;
  audience: AnnouncementAudience;
  badgeLabel: string;
  ctaLabel: string;
  ctaHref: string;
  priority: string;
  isPinned: boolean;
  isDismissible: boolean;
  startsAt: string;
  endsAt: string;
};

type Props = {
  reason: string;
  onError: (message: string) => void;
  onSuccess: (message: string) => void;
};

const toneOptions: AnnouncementTone[] = ["INFO", "UPDATE", "WARNING", "CRITICAL"];
const statusOptions: AnnouncementStatus[] = ["DRAFT", "PUBLISHED", "ARCHIVED"];
const audienceOptions: AnnouncementAudience[] = ["ALL", "FREE", "PAID", "RESELLER", "SUPERADMIN"];

const emptySummary: AdminAnnouncementSummary = {
  total: 0,
  active: 0,
  scheduled: 0,
  expired: 0,
  pinned: 0,
};

const previewToneClasses: Record<AnnouncementTone, string> = {
  INFO: "border-sky-500/20 bg-sky-500/10 text-sky-300",
  UPDATE: "border-emerald-500/20 bg-emerald-500/10 text-emerald-300",
  WARNING: "border-amber-500/20 bg-amber-500/10 text-amber-300",
  CRITICAL: "border-rose-500/20 bg-rose-500/10 text-rose-300",
};

function formatDateTime(value: string | null) {
  if (!value) return "-";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";

  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function toDateTimeLocal(value: string | null) {
  if (!value) return "";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const pad = (part: number) => part.toString().padStart(2, "0");

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function createDraft(source?: AdminAnnouncement): DraftForm {
  return {
    title: source?.title || "",
    message: source?.message || "",
    tone: source?.tone || "INFO",
    status: source?.status || "DRAFT",
    audience: source?.audience || "ALL",
    badgeLabel: source?.badgeLabel || "",
    ctaLabel: source?.ctaLabel || "",
    ctaHref: source?.ctaHref || "",
    priority: String(source?.priority ?? 0),
    isPinned: source?.isPinned ?? false,
    isDismissible: source?.isDismissible ?? true,
    startsAt: toDateTimeLocal(source?.startsAt || null),
    endsAt: toDateTimeLocal(source?.endsAt || null),
  };
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    cache: "no-store",
    ...init,
  });

  const data = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) {
    throw new Error(data.error || "Request failed.");
  }

  return data;
}

function normalizePayload(draft: DraftForm) {
  return {
    title: draft.title.trim(),
    message: draft.message.trim(),
    tone: draft.tone,
    status: draft.status,
    audience: draft.audience,
    badgeLabel: draft.badgeLabel.trim() || null,
    ctaLabel: draft.ctaLabel.trim() || null,
    ctaHref: draft.ctaHref.trim() || null,
    priority: Number.parseInt(draft.priority || "0", 10),
    isPinned: draft.isPinned,
    isDismissible: draft.isDismissible,
    startsAt: draft.startsAt ? new Date(draft.startsAt).toISOString() : null,
    endsAt: draft.endsAt ? new Date(draft.endsAt).toISOString() : null,
  };
}

function SummaryCards({ summary }: { summary: AdminAnnouncementSummary }) {
  const cards = [
    { label: "Total", value: summary.total, icon: FaBullhorn },
    { label: "Active", value: summary.active, icon: FaEye },
    { label: "Scheduled", value: summary.scheduled, icon: FaClock },
    { label: "Expired", value: summary.expired, icon: FaArchive },
    { label: "Pinned", value: summary.pinned, icon: FaThumbtack },
  ];

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
      {cards.map((card) => {
        const Icon = card.icon;

        return (
          <article
            key={card.label}
            className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-700 dark:bg-zinc-900/60"
          >
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.14em] text-zinc-500">{card.label}</p>
                <p className="mt-2 text-2xl font-semibold text-zinc-900 dark:text-zinc-100">{card.value}</p>
              </div>
              <span className="rounded-xl border border-zinc-700/80 bg-zinc-950/60 p-3 text-zinc-300">
                <Icon className="text-sm" />
              </span>
            </div>
          </article>
        );
      })}
    </div>
  );
}

export default function AdminAnnouncementsSection({ reason, onError, onSuccess }: Props) {
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [announcements, setAnnouncements] = useState<AdminAnnouncement[]>([]);
  const [summary, setSummary] = useState<AdminAnnouncementSummary>(emptySummary);
  const [drafts, setDrafts] = useState<Record<string, DraftForm>>({});
  const [createForm, setCreateForm] = useState<DraftForm>(createDraft());

  const reasonValue = useMemo(() => {
    const cleaned = reason.trim();
    return cleaned.length >= 8 ? cleaned : null;
  }, [reason]);

  const ensureReason = useCallback(() => {
    if (!reasonValue) {
      onError("Reason wajib minimal 8 karakter.");
      return null;
    }

    return reasonValue;
  }, [onError, reasonValue]);

  const loadAnnouncements = useCallback(async () => {
    setLoading(true);

    try {
      const data = await fetchJson<AdminAnnouncementsResponse>("/api/admin/announcements");
      setAnnouncements(data.announcements);
      setSummary(data.summary);
      setDrafts(Object.fromEntries(data.announcements.map((item) => [item.id, createDraft(item)])));
    } catch (error) {
      onError(error instanceof Error ? error.message : "Failed to load announcements.");
    } finally {
      setLoading(false);
    }
  }, [onError]);

  useEffect(() => {
    void loadAnnouncements();
  }, [loadAnnouncements]);

  const submitCreate = async () => {
    const reasonText = ensureReason();
    if (!reasonText) return;

    const payload = normalizePayload(createForm);
    if (!payload.title || !payload.message) {
      onError("Title dan message wajib diisi.");
      return;
    }

    if (!Number.isFinite(payload.priority)) {
      onError("Priority harus angka yang valid.");
      return;
    }

    setCreating(true);

    try {
      await fetchJson("/api/admin/announcements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...payload,
          reason: reasonText,
        }),
      });

      setCreateForm(createDraft());
      onSuccess("Announcement created.");
      await loadAnnouncements();
    } catch (error) {
      onError(error instanceof Error ? error.message : "Failed to create announcement.");
    } finally {
      setCreating(false);
    }
  };

  const saveAnnouncement = async (announcementId: string) => {
    const reasonText = ensureReason();
    if (!reasonText) return;

    const draft = drafts[announcementId];
    if (!draft) {
      onError("Draft announcement tidak ditemukan.");
      return;
    }

    const payload = normalizePayload(draft);
    if (!payload.title || !payload.message) {
      onError("Title dan message wajib diisi.");
      return;
    }

    if (!Number.isFinite(payload.priority)) {
      onError("Priority harus angka yang valid.");
      return;
    }

    setSavingId(announcementId);

    try {
      await fetchJson(`/api/admin/announcements/${announcementId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...payload,
          reason: reasonText,
        }),
      });

      onSuccess("Announcement updated.");
      await loadAnnouncements();
    } catch (error) {
      onError(error instanceof Error ? error.message : "Failed to update announcement.");
    } finally {
      setSavingId(null);
    }
  };

  const deleteAnnouncement = async (announcementId: string) => {
    const reasonText = ensureReason();
    if (!reasonText) return;

    if (!window.confirm("Hapus announcement ini?")) {
      return;
    }

    setDeletingId(announcementId);

    try {
      await fetchJson(`/api/admin/announcements/${announcementId}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: reasonText }),
      });

      onSuccess("Announcement deleted.");
      await loadAnnouncements();
    } catch (error) {
      onError(error instanceof Error ? error.message : "Failed to delete announcement.");
    } finally {
      setDeletingId(null);
    }
  };

  const updateDraft = (announcementId: string, nextDraft: DraftForm) => {
    setDrafts((current) => ({
      ...current,
      [announcementId]: nextDraft,
    }));
  };

  return (
    <section className="space-y-4">
      <SummaryCards summary={summary} />

      <section className="grid gap-4 xl:grid-cols-[1.35fr_0.85fr]">
        <article className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-700 dark:bg-zinc-900/60">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h4 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Create Announcement</h4>
              <p className="mt-1 text-xs text-zinc-500">Banner tampil di `/dashboard` dan bisa di-dismiss per browser.</p>
            </div>
            <Button type="button" className="h-10 px-3 text-xs" onClick={() => void loadAnnouncements()} isLoading={loading}>
              Refresh
            </Button>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <input value={createForm.title} onChange={(event) => setCreateForm((current) => ({ ...current, title: event.target.value }))} className="h-10 rounded-lg border border-zinc-300 bg-white px-3 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100" placeholder="Title" />
            <input value={createForm.badgeLabel} onChange={(event) => setCreateForm((current) => ({ ...current, badgeLabel: event.target.value }))} className="h-10 rounded-lg border border-zinc-300 bg-white px-3 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100" placeholder="Badge label" />
            <select value={createForm.tone} onChange={(event) => setCreateForm((current) => ({ ...current, tone: event.target.value as AnnouncementTone }))} className="h-10 rounded-lg border border-zinc-300 bg-white px-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100">{toneOptions.map((option) => <option key={option} value={option}>{option}</option>)}</select>
            <select value={createForm.status} onChange={(event) => setCreateForm((current) => ({ ...current, status: event.target.value as AnnouncementStatus }))} className="h-10 rounded-lg border border-zinc-300 bg-white px-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100">{statusOptions.map((option) => <option key={option} value={option}>{option}</option>)}</select>
            <select value={createForm.audience} onChange={(event) => setCreateForm((current) => ({ ...current, audience: event.target.value as AnnouncementAudience }))} className="h-10 rounded-lg border border-zinc-300 bg-white px-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100">{audienceOptions.map((option) => <option key={option} value={option}>{option}</option>)}</select>
            <input value={createForm.priority} onChange={(event) => setCreateForm((current) => ({ ...current, priority: event.target.value }))} className="h-10 rounded-lg border border-zinc-300 bg-white px-3 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100" inputMode="numeric" placeholder="Priority" />
            <label className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-zinc-300 bg-white px-3 text-sm text-zinc-700 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200"><input type="checkbox" checked={createForm.isPinned} onChange={(event) => setCreateForm((current) => ({ ...current, isPinned: event.target.checked }))} />Pinned</label>
            <label className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-zinc-300 bg-white px-3 text-sm text-zinc-700 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200"><input type="checkbox" checked={createForm.isDismissible} onChange={(event) => setCreateForm((current) => ({ ...current, isDismissible: event.target.checked }))} />Dismissible</label>
            <input type="datetime-local" value={createForm.startsAt} onChange={(event) => setCreateForm((current) => ({ ...current, startsAt: event.target.value }))} className="h-10 rounded-lg border border-zinc-300 bg-white px-3 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100" />
            <input type="datetime-local" value={createForm.endsAt} onChange={(event) => setCreateForm((current) => ({ ...current, endsAt: event.target.value }))} className="h-10 rounded-lg border border-zinc-300 bg-white px-3 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100" />
            <input value={createForm.ctaLabel} onChange={(event) => setCreateForm((current) => ({ ...current, ctaLabel: event.target.value }))} className="h-10 rounded-lg border border-zinc-300 bg-white px-3 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100" placeholder="CTA label" />
            <input value={createForm.ctaHref} onChange={(event) => setCreateForm((current) => ({ ...current, ctaHref: event.target.value }))} className="h-10 rounded-lg border border-zinc-300 bg-white px-3 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100" placeholder="CTA href" />
          </div>

          <textarea value={createForm.message} onChange={(event) => setCreateForm((current) => ({ ...current, message: event.target.value }))} className="mt-3 min-h-32 w-full rounded-lg border border-zinc-300 bg-white px-3 py-3 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100" placeholder="Announcement message" />

          <div className="mt-3 flex justify-end">
            <Button type="button" className="h-10" isLoading={creating} onClick={() => void submitCreate()}>
              Create Announcement
            </Button>
          </div>
        </article>

        <article className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-700 dark:bg-zinc-900/60">
          <div className="flex items-center gap-2">
            <FaInfoCircle className="text-sm text-zinc-400" />
            <h4 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Live Preview</h4>
          </div>

          <div className={["mt-4 rounded-2xl border p-4", previewToneClasses[createForm.tone]].join(" ")}>
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex rounded-full border border-current/25 bg-black/15 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em]">{createForm.badgeLabel.trim() || createForm.tone}</span>
              {createForm.isDismissible ? <span className="inline-flex rounded-full border border-zinc-700/70 bg-zinc-950/50 px-2.5 py-1 text-[11px] font-medium text-zinc-300">Dismissible</span> : null}
            </div>
            <p className="mt-3 text-base font-semibold text-white">{createForm.title.trim() || "Announcement title"}</p>
            <p className="mt-1 text-sm leading-relaxed text-zinc-200">{createForm.message.trim() || "Preview pesan update, maintenance, atau info penting akan tampil di sini."}</p>
            {createForm.ctaLabel.trim() && createForm.ctaHref.trim() ? <span className="mt-4 inline-flex h-10 items-center justify-center rounded-lg bg-zinc-100 px-4 text-sm font-medium text-zinc-900">{createForm.ctaLabel.trim()}</span> : null}
          </div>

          <div className="mt-4 space-y-2 text-xs text-zinc-500">
            <p>Audience: {createForm.audience}</p>
            <p>Status: {createForm.status}</p>
            <p>Priority: {createForm.priority || "0"}</p>
          </div>
        </article>
      </section>
      <section className="space-y-3">
        {announcements.length === 0 ? (
          <article className="rounded-xl border border-zinc-200 bg-zinc-50 p-5 text-sm text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900/60">
            Belum ada announcement. Buat announcement pertama dari form di atas.
          </article>
        ) : (
          announcements.map((announcement) => {
            const draft = drafts[announcement.id] || createDraft(announcement);

            return (
              <article key={announcement.id} className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-700 dark:bg-zinc-900/60">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex rounded-full border border-zinc-700/70 bg-zinc-950/60 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-300">{announcement.status}</span>
                      <span className="inline-flex rounded-full border border-zinc-700/70 bg-zinc-950/60 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-300">{announcement.audience}</span>
                      {announcement.isPinned ? <span className="inline-flex rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-amber-400">PINNED</span> : null}
                    </div>
                    <p className="mt-2 text-sm font-semibold text-zinc-900 dark:text-zinc-100">{announcement.title}</p>
                    <p className="mt-1 text-xs text-zinc-500">Created by {announcement.createdBy.email} · Updated {formatDateTime(announcement.updatedAt)} · v{announcement.version}</p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Button type="button" className="h-9 px-3 text-xs" isLoading={savingId === announcement.id} onClick={() => void saveAnnouncement(announcement.id)}>Save</Button>
                    <Button type="button" variant="ghost" className="h-9 border border-rose-500/30 px-3 text-xs text-rose-400 hover:bg-rose-500/10 dark:hover:bg-rose-500/10" isLoading={deletingId === announcement.id} onClick={() => void deleteAnnouncement(announcement.id)}>Delete</Button>
                  </div>
                </div>

                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <input value={draft.title} onChange={(event) => updateDraft(announcement.id, { ...draft, title: event.target.value })} className="h-10 rounded-lg border border-zinc-300 bg-white px-3 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100" placeholder="Title" />
                  <input value={draft.badgeLabel} onChange={(event) => updateDraft(announcement.id, { ...draft, badgeLabel: event.target.value })} className="h-10 rounded-lg border border-zinc-300 bg-white px-3 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100" placeholder="Badge label" />
                  <select value={draft.tone} onChange={(event) => updateDraft(announcement.id, { ...draft, tone: event.target.value as AnnouncementTone })} className="h-10 rounded-lg border border-zinc-300 bg-white px-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100">{toneOptions.map((option) => <option key={option} value={option}>{option}</option>)}</select>
                  <select value={draft.status} onChange={(event) => updateDraft(announcement.id, { ...draft, status: event.target.value as AnnouncementStatus })} className="h-10 rounded-lg border border-zinc-300 bg-white px-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100">{statusOptions.map((option) => <option key={option} value={option}>{option}</option>)}</select>
                  <select value={draft.audience} onChange={(event) => updateDraft(announcement.id, { ...draft, audience: event.target.value as AnnouncementAudience })} className="h-10 rounded-lg border border-zinc-300 bg-white px-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100">{audienceOptions.map((option) => <option key={option} value={option}>{option}</option>)}</select>
                  <input value={draft.priority} onChange={(event) => updateDraft(announcement.id, { ...draft, priority: event.target.value })} className="h-10 rounded-lg border border-zinc-300 bg-white px-3 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100" inputMode="numeric" placeholder="Priority" />
                  <label className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-zinc-300 bg-white px-3 text-sm text-zinc-700 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200"><input type="checkbox" checked={draft.isPinned} onChange={(event) => updateDraft(announcement.id, { ...draft, isPinned: event.target.checked })} />Pinned</label>
                  <label className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-zinc-300 bg-white px-3 text-sm text-zinc-700 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200"><input type="checkbox" checked={draft.isDismissible} onChange={(event) => updateDraft(announcement.id, { ...draft, isDismissible: event.target.checked })} />Dismissible</label>
                  <input type="datetime-local" value={draft.startsAt} onChange={(event) => updateDraft(announcement.id, { ...draft, startsAt: event.target.value })} className="h-10 rounded-lg border border-zinc-300 bg-white px-3 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100" />
                  <input type="datetime-local" value={draft.endsAt} onChange={(event) => updateDraft(announcement.id, { ...draft, endsAt: event.target.value })} className="h-10 rounded-lg border border-zinc-300 bg-white px-3 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100" />
                  <input value={draft.ctaLabel} onChange={(event) => updateDraft(announcement.id, { ...draft, ctaLabel: event.target.value })} className="h-10 rounded-lg border border-zinc-300 bg-white px-3 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100" placeholder="CTA label" />
                  <input value={draft.ctaHref} onChange={(event) => updateDraft(announcement.id, { ...draft, ctaHref: event.target.value })} className="h-10 rounded-lg border border-zinc-300 bg-white px-3 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100" placeholder="CTA href" />
                </div>

                <textarea value={draft.message} onChange={(event) => updateDraft(announcement.id, { ...draft, message: event.target.value })} className="mt-3 min-h-28 w-full rounded-lg border border-zinc-300 bg-white px-3 py-3 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100" placeholder="Announcement message" />

                <div className={["mt-3 rounded-2xl border p-4", previewToneClasses[draft.tone]].join(" ")}>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex rounded-full border border-current/25 bg-black/15 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em]">{draft.badgeLabel.trim() || draft.tone}</span>
                    {draft.isDismissible ? <span className="inline-flex rounded-full border border-zinc-700/70 bg-zinc-950/50 px-2.5 py-1 text-[11px] font-medium text-zinc-300">Dismissible</span> : null}
                  </div>
                  <p className="mt-3 text-base font-semibold text-white">{draft.title.trim() || "Announcement title"}</p>
                  <p className="mt-1 text-sm leading-relaxed text-zinc-200">{draft.message.trim() || "Preview akan tampil di sini."}</p>
                  {draft.ctaLabel.trim() && draft.ctaHref.trim() ? <span className="mt-4 inline-flex h-10 items-center justify-center rounded-lg bg-zinc-100 px-4 text-sm font-medium text-zinc-900">{draft.ctaLabel.trim()}</span> : null}
                </div>

                <div className="mt-3 rounded-xl border border-zinc-200 bg-white/60 p-3 text-xs text-zinc-500 dark:border-zinc-700 dark:bg-zinc-950/40">
                  <p>Created: {formatDateTime(announcement.createdAt)}</p>
                  <p className="mt-1">Starts: {formatDateTime(announcement.startsAt)}</p>
                  <p className="mt-1">Ends: {formatDateTime(announcement.endsAt)}</p>
                </div>
              </article>
            );
          })
        )}
      </section>
    </section>
  );
}
