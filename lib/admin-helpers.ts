import { z } from "zod";

export const actionReasonSchema = z
  .string()
  .trim()
  .min(8, "Reason must be at least 8 characters.")
  .max(180, "Reason is too long.");

export function parsePagination(searchParams: URLSearchParams) {
  const page = Number.parseInt(searchParams.get("page") || "1", 10);
  const pageSize = Number.parseInt(searchParams.get("pageSize") || "20", 10);

  const safePage = Number.isFinite(page) && page > 0 ? page : 1;
  const safePageSize = Number.isFinite(pageSize) && pageSize > 0 ? Math.min(pageSize, 100) : 20;

  return {
    page: safePage,
    pageSize: safePageSize,
    skip: (safePage - 1) * safePageSize,
    take: safePageSize,
  };
}

export function parseSortOrder(value: string | null) {
  if (!value) {
    return "desc" as const;
  }

  return value.toLowerCase() === "asc" ? ("asc" as const) : ("desc" as const);
}

export function parseBooleanFilter(value: string | null) {
  if (value === null) {
    return undefined;
  }

  const normalized = value.trim().toLowerCase();
  if (normalized === "true" || normalized === "1" || normalized === "yes") {
    return true;
  }

  if (normalized === "false" || normalized === "0" || normalized === "no") {
    return false;
  }

  return undefined;
}
