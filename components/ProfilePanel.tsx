"use client";

import { type ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  FaCamera,
  FaChartLine,
  FaCheckCircle,
  FaEye,
  FaEyeSlash,
  FaKey,
  FaLock,
  FaSave,
  FaTimes,
  FaTrash,
} from "react-icons/fa";

import Button from "@/components/Button";
import { useToast } from "@/components/ToastProvider";

type ProfileData = {
  id: string;
  name: string | null;
  email: string;
  avatarUrl: string | null;
  plan: "FREE" | "PAID" | "RESELLER";
  role: "USER" | "SUPERADMIN";
  createdAt: string;
};

type ProfileStats = {
  totalApiKeys: number;
  activeApiKeys: number;
  totalRequests: number;
  requestsToday: number;
};

type ProfilePanelProps = {
  profile: ProfileData;
  stats: ProfileStats;
};

type CropDraft = {
  sourceUrl: string;
  fileName: string;
  zoom: number;
  offsetX: number;
  offsetY: number;
};

type ApiResponse<T extends object = object> = T & {
  error?: string;
  message?: string;
};

const MAX_AVATAR_SIZE = 2 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const PLAN_BADGE_CLASS: Record<ProfileData["plan"], string> = {
  FREE: "bg-zinc-600/50 text-zinc-100",
  PAID: "bg-emerald-500/20 text-emerald-300",
  RESELLER: "bg-amber-500/20 text-amber-300",
};

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "-";
  }
  return new Intl.DateTimeFormat("id-ID", { dateStyle: "medium" }).format(date);
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("id-ID").format(value);
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

async function loadImageFromUrl(sourceUrl: string) {
  return await new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Failed to load image."));
    image.src = sourceUrl;
  });
}

async function createCroppedAvatarBlob(sourceUrl: string, zoom: number, offsetX: number, offsetY: number) {
  const image = await loadImageFromUrl(sourceUrl);

  const width = image.naturalWidth || image.width;
  const height = image.naturalHeight || image.height;
  const cropSize = Math.min(width, height) / clamp(zoom, 1, 3);

  const maxShiftX = Math.max((width - cropSize) / 2, 0);
  const maxShiftY = Math.max((height - cropSize) / 2, 0);

  const centerX = width / 2 + (clamp(offsetX, -100, 100) / 100) * maxShiftX;
  const centerY = height / 2 + (clamp(offsetY, -100, 100) / 100) * maxShiftY;

  const sx = clamp(centerX - cropSize / 2, 0, Math.max(width - cropSize, 0));
  const sy = clamp(centerY - cropSize / 2, 0, Math.max(height - cropSize, 0));

  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;

  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Failed to initialize image canvas.");
  }

  context.drawImage(image, sx, sy, cropSize, cropSize, 0, 0, canvas.width, canvas.height);

  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("Failed to create cropped image."));
          return;
        }
        resolve(blob);
      },
      "image/webp",
      0.9,
    );
  });
}

export default function ProfilePanel({ profile, stats }: ProfilePanelProps) {
  const router = useRouter();
  const toast = useToast();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [name, setName] = useState(profile.name || "");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(profile.avatarUrl);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [isRemovingAvatar, setIsRemovingAvatar] = useState(false);

  const [cropDraft, setCropDraft] = useState<CropDraft | null>(null);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPasswords, setShowPasswords] = useState(false);
  const [isChangingPassword, setIsChangingPassword] = useState(false);

  const fallbackInitial = useMemo(
    () => (name || profile.email).trim().charAt(0).toUpperCase() || "U",
    [name, profile.email],
  );

  const cropSourceUrl = cropDraft?.sourceUrl;

  useEffect(() => {
    return () => {
      if (cropSourceUrl) {
        URL.revokeObjectURL(cropSourceUrl);
      }
    };
  }, [cropSourceUrl]);

  const onPickAvatar = () => {
    fileInputRef.current?.click();
  };

  const closeCropDraft = () => {
    if (cropDraft?.sourceUrl) {
      URL.revokeObjectURL(cropDraft.sourceUrl);
    }
    setCropDraft(null);
  };

  const onAvatarFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) {
      return;
    }

    if (!ALLOWED_MIME_TYPES.has(file.type)) {
      toast.error("Avatar harus JPG, PNG, atau WEBP.", "Invalid file");
      return;
    }

    if (file.size > MAX_AVATAR_SIZE) {
      toast.error("Ukuran avatar maksimal 2MB.", "File too large");
      return;
    }

    const sourceUrl = URL.createObjectURL(file);
    setCropDraft({
      sourceUrl,
      fileName: file.name,
      zoom: 1,
      offsetX: 0,
      offsetY: 0,
    });
  };

  const uploadCroppedAvatar = async () => {
    if (!cropDraft) {
      return;
    }

    setIsUploadingAvatar(true);

    try {
      const croppedBlob = await createCroppedAvatarBlob(
        cropDraft.sourceUrl,
        cropDraft.zoom,
        cropDraft.offsetX,
        cropDraft.offsetY,
      );

      const formData = new FormData();
      formData.append("avatar", new File([croppedBlob], "avatar.webp", { type: "image/webp" }));

      const response = await fetch("/api/account/avatar", {
        method: "POST",
        body: formData,
      });
      const data = (await response.json()) as ApiResponse<{ avatarUrl?: string | null }>;

      if (!response.ok) {
        toast.error(data.error || "Gagal upload avatar.", "Upload failed");
        setIsUploadingAvatar(false);
        return;
      }

      setAvatarUrl(data.avatarUrl || null);
      toast.success("Avatar berhasil diupdate.", "Profile updated");
      closeCropDraft();
      router.refresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to process avatar.";
      toast.error(message, "Upload failed");
    } finally {
      setIsUploadingAvatar(false);
    }
  };

  const removeAvatar = async () => {
    setIsRemovingAvatar(true);

    try {
      const response = await fetch("/api/account/avatar", { method: "DELETE" });
      const data = (await response.json()) as ApiResponse;

      if (!response.ok) {
        toast.error(data.error || "Gagal menghapus avatar.", "Remove failed");
        setIsRemovingAvatar(false);
        return;
      }

      setAvatarUrl(null);
      toast.success("Avatar dihapus.", "Profile updated");
      router.refresh();
    } catch {
      toast.error("Network error while removing avatar.", "Remove failed");
    } finally {
      setIsRemovingAvatar(false);
    }
  };

  const saveProfile = async () => {
    setIsSavingProfile(true);

    try {
      const response = await fetch("/api/account/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = (await response.json()) as ApiResponse;

      if (!response.ok) {
        toast.error(data.error || "Gagal menyimpan profile.", "Update failed");
        setIsSavingProfile(false);
        return;
      }

      toast.success("Profile berhasil diupdate.", "Profile updated");
      router.refresh();
    } catch {
      toast.error("Network error while saving profile.", "Update failed");
    } finally {
      setIsSavingProfile(false);
    }
  };

  const changePassword = async () => {
    if (!currentPassword || !newPassword || !confirmPassword) {
      toast.warning("Semua field password wajib diisi.", "Validation");
      return;
    }

    if (newPassword.length < 8) {
      toast.warning("Password baru minimal 8 karakter.", "Validation");
      return;
    }

    if (newPassword !== confirmPassword) {
      toast.warning("Konfirmasi password tidak sama.", "Validation");
      return;
    }

    setIsChangingPassword(true);

    try {
      const response = await fetch("/api/account/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentPassword,
          newPassword,
          confirmPassword,
        }),
      });
      const data = (await response.json()) as ApiResponse;

      if (!response.ok) {
        toast.error(data.error || "Gagal ubah password.", "Password update failed");
        setIsChangingPassword(false);
        return;
      }

      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      toast.success("Password berhasil diubah.", "Password updated");
    } catch {
      toast.error("Network error while changing password.", "Password update failed");
    } finally {
      setIsChangingPassword(false);
    }
  };

  const statCards = [
    {
      label: "Total API Keys",
      value: formatNumber(stats.totalApiKeys),
      icon: FaKey,
    },
    {
      label: "Active API Keys",
      value: formatNumber(stats.activeApiKeys),
      icon: FaCheckCircle,
    },
    {
      label: "Total Requests",
      value: formatNumber(stats.totalRequests),
      icon: FaChartLine,
    },
    {
      label: "Requests Today",
      value: formatNumber(stats.requestsToday),
      icon: FaChartLine,
    },
  ];

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-zinc-200 bg-white/80 p-5 dark:border-zinc-800/80 dark:bg-zinc-900/70">
        <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
          <article className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-700 dark:bg-zinc-950/60">
            <div className="flex items-center gap-3">
              <div className="relative">
                <div className="size-24 overflow-hidden rounded-full border border-zinc-700 bg-zinc-900">
                  {avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={avatarUrl} alt="Profile avatar" className="size-full object-cover" />
                  ) : (
                    <div className="flex size-full items-center justify-center text-2xl font-semibold text-zinc-100">
                      {fallbackInitial}
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={onPickAvatar}
                  className="absolute -bottom-1 -right-1 inline-flex size-8 items-center justify-center rounded-full border border-zinc-600 bg-zinc-800 text-zinc-100 transition-colors hover:bg-zinc-700"
                  title="Upload avatar"
                >
                  <FaCamera className="text-xs" />
                </button>
              </div>

              <div className="min-w-0">
                <p className="truncate text-base font-semibold text-zinc-900 dark:text-zinc-100">
                  {name || "Unnamed User"}
                </p>
                <p className="truncate text-xs text-zinc-500">{profile.email}</p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${PLAN_BADGE_CLASS[profile.plan]}`}>
                    {profile.plan}
                  </span>
                  <span className="inline-flex rounded-full border border-zinc-700 bg-zinc-800/70 px-2 py-0.5 text-[11px] font-semibold text-zinc-200">
                    {profile.role}
                  </span>
                </div>
              </div>
            </div>

            <p className="mt-3 text-xs text-zinc-500">Joined: {formatDate(profile.createdAt)}</p>

            <div className="mt-3 flex gap-2">
              <Button
                type="button"
                className="h-9 flex-1 text-xs"
                onClick={onPickAvatar}
                isLoading={isUploadingAvatar}
                loadingText="Uploading..."
              >
                Upload
              </Button>
              <Button
                type="button"
                variant="secondary"
                className="h-9 px-3 text-xs"
                onClick={removeAvatar}
                disabled={!avatarUrl}
                isLoading={isRemovingAvatar}
                loadingText="Removing..."
              >
                <span className="inline-flex items-center gap-2">
                  <FaTrash className="text-[10px]" />
                  Remove
                </span>
              </Button>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={onAvatarFileChange}
            />
          </article>

          <article className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-700 dark:bg-zinc-950/60">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Profile Information</h3>
              <span className="text-xs text-zinc-500">Status: ACTIVE</span>
            </div>

            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <div className="space-y-1.5">
                <label className="text-xs text-zinc-500">Name</label>
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  maxLength={60}
                  className="h-10 w-full rounded-lg border border-zinc-300 bg-white px-3 text-sm text-zinc-900 outline-none transition-colors focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                  placeholder="Your display name"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs text-zinc-500">Email</label>
                <input
                  value={profile.email}
                  disabled
                  className="h-10 w-full rounded-lg border border-zinc-300 bg-zinc-100 px-3 text-sm text-zinc-500 outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400"
                />
              </div>
            </div>

            <div className="mt-4">
              <Button
                type="button"
                onClick={saveProfile}
                isLoading={isSavingProfile}
                loadingText="Saving..."
                className="h-10"
              >
                <span className="inline-flex items-center gap-2">
                  <FaSave className="text-xs" />
                  Save Profile
                </span>
              </Button>
            </div>
          </article>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {statCards.map((item) => {
          const Icon = item.icon;
          return (
            <article
              key={item.label}
              className="rounded-xl border border-zinc-200 bg-white/80 p-4 dark:border-zinc-800 dark:bg-zinc-900/70"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-xs uppercase tracking-wide text-zinc-500">{item.label}</p>
                  <p className="mt-1 text-2xl font-semibold text-zinc-900 dark:text-zinc-100">{item.value}</p>
                </div>
                <span className="rounded-lg border border-zinc-300 bg-zinc-100 p-2 text-zinc-600 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-300">
                  <Icon className="text-sm" />
                </span>
              </div>
            </article>
          );
        })}
      </section>

      <section className="rounded-2xl border border-zinc-200 bg-white/80 p-5 dark:border-zinc-800/80 dark:bg-zinc-900/70">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">Security</h3>
          <button
            type="button"
            onClick={() => setShowPasswords((value) => !value)}
            className="inline-flex h-8 items-center gap-2 rounded-md border border-zinc-300 px-2.5 text-xs text-zinc-700 transition-colors hover:bg-zinc-200 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            {showPasswords ? <FaEyeSlash className="text-[10px]" /> : <FaEye className="text-[10px]" />}
            {showPasswords ? "Hide" : "Show"}
          </button>
        </div>

        <div className="mt-3 grid gap-3 md:grid-cols-3">
          <div className="space-y-1.5">
            <label className="text-xs text-zinc-500">Current password</label>
            <input
              type={showPasswords ? "text" : "password"}
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              className="h-10 w-full rounded-lg border border-zinc-300 bg-white px-3 text-sm text-zinc-900 outline-none transition-colors focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
              placeholder="Current password"
              autoComplete="current-password"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs text-zinc-500">New password</label>
            <input
              type={showPasswords ? "text" : "password"}
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              className="h-10 w-full rounded-lg border border-zinc-300 bg-white px-3 text-sm text-zinc-900 outline-none transition-colors focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
              placeholder="Minimum 8 chars"
              autoComplete="new-password"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs text-zinc-500">Confirm password</label>
            <input
              type={showPasswords ? "text" : "password"}
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              className="h-10 w-full rounded-lg border border-zinc-300 bg-white px-3 text-sm text-zinc-900 outline-none transition-colors focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
              placeholder="Repeat new password"
              autoComplete="new-password"
            />
          </div>
        </div>

        <div className="mt-4">
          <Button
            type="button"
            onClick={changePassword}
            isLoading={isChangingPassword}
            loadingText="Updating..."
            className="h-10"
          >
            <span className="inline-flex items-center gap-2">
              <FaLock className="text-xs" />
              Update Password
            </span>
          </Button>
        </div>
      </section>

      {cropDraft ? (
        <div className="fixed inset-0 z-[75] flex items-center justify-center bg-black/70 px-4">
          <div className="w-full max-w-3xl rounded-2xl border border-zinc-700 bg-zinc-950 p-4 shadow-2xl">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <h4 className="text-base font-semibold text-zinc-100">Crop Profile Photo</h4>
                <p className="truncate text-xs text-zinc-400">{cropDraft.fileName}</p>
              </div>
              <button
                type="button"
                onClick={closeCropDraft}
                className="inline-flex size-8 items-center justify-center rounded-md border border-zinc-700 text-zinc-300 transition-colors hover:bg-zinc-800"
                aria-label="Close crop modal"
              >
                <FaTimes className="text-xs" />
              </button>
            </div>

            <div className="grid gap-4 lg:grid-cols-[1fr_240px]">
              <div className="flex items-center justify-center rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
                <div className="relative size-[min(72vw,340px)] max-h-[62vh] max-w-[340px] overflow-hidden rounded-2xl border border-zinc-700 bg-zinc-950">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={cropDraft.sourceUrl}
                    alt="Avatar crop preview"
                    className="size-full object-cover"
                    style={{
                      transform: `scale(${cropDraft.zoom}) translate(${cropDraft.offsetX}%, ${cropDraft.offsetY}%)`,
                      transformOrigin: "center center",
                    }}
                  />
                  <div className="pointer-events-none absolute inset-0">
                    <div className="absolute inset-3 rounded-full border-2 border-white/90 shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]" />
                  </div>
                </div>
              </div>

              <div className="space-y-3 rounded-xl border border-zinc-800 bg-zinc-900/60 p-3">
                <div className="space-y-1">
                  <label className="text-xs text-zinc-400">Zoom</label>
                  <input
                    type="range"
                    min={1}
                    max={3}
                    step={0.01}
                    value={cropDraft.zoom}
                    onChange={(event) =>
                      setCropDraft((current) =>
                        current
                          ? {
                              ...current,
                              zoom: Number.parseFloat(event.target.value),
                            }
                          : current,
                      )
                    }
                    className="w-full accent-zinc-100"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs text-zinc-400">Horizontal</label>
                  <input
                    type="range"
                    min={-100}
                    max={100}
                    step={1}
                    value={cropDraft.offsetX}
                    onChange={(event) =>
                      setCropDraft((current) =>
                        current
                          ? {
                              ...current,
                              offsetX: Number.parseInt(event.target.value, 10) || 0,
                            }
                          : current,
                      )
                    }
                    className="w-full accent-zinc-100"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs text-zinc-400">Vertical</label>
                  <input
                    type="range"
                    min={-100}
                    max={100}
                    step={1}
                    value={cropDraft.offsetY}
                    onChange={(event) =>
                      setCropDraft((current) =>
                        current
                          ? {
                              ...current,
                              offsetY: Number.parseInt(event.target.value, 10) || 0,
                            }
                          : current,
                      )
                    }
                    className="w-full accent-zinc-100"
                  />
                </div>

                <p className="text-xs text-zinc-500">
                  Tips: atur zoom dan posisi sampai area lingkaran pas untuk avatar.
                </p>

                <div className="flex gap-2 pt-1">
                  <Button type="button" variant="ghost" className="h-10 flex-1" onClick={closeCropDraft}>
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    className="h-10 flex-1"
                    onClick={uploadCroppedAvatar}
                    isLoading={isUploadingAvatar}
                    loadingText="Uploading..."
                  >
                    Apply Crop
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
