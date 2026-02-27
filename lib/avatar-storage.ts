import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const AVATAR_UPLOAD_DIR = path.join(process.cwd(), "public", "uploads", "avatars");
const MAX_AVATAR_SIZE = 2 * 1024 * 1024;

const allowedMimeMap: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
};

export function getAvatarConstraints() {
  return {
    maxSizeBytes: MAX_AVATAR_SIZE,
    allowedMimeTypes: Object.keys(allowedMimeMap),
  };
}

export function isManagedAvatarUrl(value: string | null | undefined) {
  if (!value) {
    return false;
  }

  return value.startsWith("/uploads/avatars/");
}

function resolveManagedAvatarAbsolutePath(avatarUrl: string) {
  const relativePath = avatarUrl.replace(/^\//, "");
  return path.join(process.cwd(), "public", relativePath);
}

export async function deleteManagedAvatarByUrl(avatarUrl: string | null | undefined) {
  if (!avatarUrl || !isManagedAvatarUrl(avatarUrl)) {
    return;
  }

  const filePath = resolveManagedAvatarAbsolutePath(avatarUrl);
  try {
    await rm(filePath, { force: true });
  } catch {
    // Ignore delete failures so profile update/upload can proceed.
  }
}

function normalizeFileExtension(file: File) {
  const byMime = allowedMimeMap[file.type];
  if (byMime) {
    return byMime;
  }

  const name = file.name.toLowerCase();
  if (name.endsWith(".jpg") || name.endsWith(".jpeg")) {
    return ".jpg";
  }
  if (name.endsWith(".png")) {
    return ".png";
  }
  if (name.endsWith(".webp")) {
    return ".webp";
  }

  return null;
}

export async function saveAvatarFile(userId: string, file: File) {
  if (!(file instanceof File)) {
    throw new Error("Avatar file is required.");
  }

  if (file.size <= 0) {
    throw new Error("Avatar file is empty.");
  }

  if (file.size > MAX_AVATAR_SIZE) {
    throw new Error("Avatar file exceeds the 2MB limit.");
  }

  const extension = normalizeFileExtension(file);
  if (!extension) {
    throw new Error("Avatar must be JPG, PNG, or WEBP.");
  }

  await mkdir(AVATAR_UPLOAD_DIR, { recursive: true });

  const safeUserId = userId.replace(/[^a-zA-Z0-9_-]/g, "");
  const filename = `${safeUserId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}${extension}`;
  const absolutePath = path.join(AVATAR_UPLOAD_DIR, filename);

  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(absolutePath, buffer);

  return `/uploads/avatars/${filename}`;
}
