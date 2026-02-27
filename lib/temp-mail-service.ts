import { NextResponse } from "next/server";

import { getApiEndpointStatusBySlug } from "@/lib/api-endpoints";
import { buildBanInfo, normalizeUserBanState } from "@/lib/ban";
import { prisma } from "@/lib/prisma";

const cloudscraper = require("cloudscraper") as (options: Record<string, unknown>) => Promise<unknown>;

const CREATOR = "JzProject";

const TEMP_MAIL_API = {
  base: "https://web2.temp-mail.org",
  mailbox: "/mailbox",
  messages: "/messages",
};

type TempMailMessage = {
  id: string;
  receivedAt: number | null;
  from: string;
  subject: string;
  bodyPreview: string;
  bodyHtml: string | null;
  attachmentsCount: number;
  attachments: unknown[];
  createdAt: string | null;
  error?: string;
};

type TempMailGenerateResult =
  | {
      success: true;
      result: {
        token: string;
        email: string;
      };
    }
  | {
      success: false;
      result: string;
    };

type TempMailInboxResult =
  | {
      success: true;
      result: {
        email: string;
        messages: TempMailMessage[];
      };
    }
  | {
      success: false;
      result: string;
    };

function errorResponse(code: number, message: string) {
  return NextResponse.json(
    {
      status: false,
      code,
      creator: CREATOR,
      message,
    },
    { status: code },
  );
}

function getUtcDateOnly(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toStringValue(value: unknown) {
  return typeof value === "string" ? value : "";
}

function toNumberValue(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return null;
}

function toRecord(value: unknown) {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

async function requestTempMail(options: Record<string, unknown>, maxRetries = 5) {
  for (let attempt = 0; attempt < maxRetries; attempt += 1) {
    try {
      const response = await cloudscraper({
        ...options,
        cloudflareTimeout: 7000,
        followAllRedirects: true,
        json: false,
      });

      if (typeof response === "string") {
        try {
          return JSON.parse(response) as unknown;
        } catch {
          throw new Error("Invalid JSON response from temp-mail source.");
        }
      }

      return response;
    } catch (error) {
      if (attempt === maxRetries - 1) {
        const payload = toRecord(error);
        const errorMsg = toStringValue(payload?.error) || toStringValue(payload?.message) || "Unknown error";
        throw new Error(errorMsg);
      }

      await sleep(2 ** attempt * 1000);
    }
  }

  throw new Error("Unknown temp-mail request failure.");
}

const tempMail = {
  api: TEMP_MAIL_API,

  generate: async function generate(): Promise<TempMailGenerateResult> {
    try {
      const response = await requestTempMail({
        uri: `${this.api.base}${this.api.mailbox}`,
        method: "POST",
        body: "{}",
        headers: {
          "content-type": "application/json",
          origin: "https://temp-mail.org",
          referer: "https://temp-mail.org/",
        },
      });

      const payload = toRecord(response);
      const token = toStringValue(payload?.token);
      const mailbox = toStringValue(payload?.mailbox);

      if (!token || !mailbox) {
        return {
          success: false,
          result: "Gagal generate email dari server",
        };
      }

      return {
        success: true,
        result: {
          token,
          email: mailbox,
        },
      };
    } catch (error) {
      return {
        success: false,
        result: error instanceof Error ? error.message : "Unknown error",
      };
    }
  },

  inbox: async function inbox(token: string): Promise<TempMailInboxResult> {
    if (!token) {
      return {
        success: false,
        result: "Token tidak boleh kosong",
      };
    }

    try {
      const listResponse = await requestTempMail({
        uri: `${this.api.base}${this.api.messages}`,
        method: "GET",
        headers: {
          authorization: `Bearer ${token}`,
          origin: "https://temp-mail.org",
          referer: "https://temp-mail.org/",
        },
      });

      const listPayload = toRecord(listResponse);
      const email = toStringValue(listPayload?.mailbox);
      const rawMessages = Array.isArray(listPayload?.messages) ? listPayload?.messages : [];

      if (rawMessages.length === 0) {
        return {
          success: true,
          result: {
            email,
            messages: [],
          },
        };
      }

      const detailedMessages = await Promise.all(
        rawMessages.map(async (rawItem) => {
          const item = toRecord(rawItem);
          const messageId = toStringValue(item?._id);

          if (!messageId) {
            return {
              id: "",
              receivedAt: null,
              from: "",
              subject: "",
              bodyPreview: "",
              bodyHtml: null,
              attachmentsCount: 0,
              attachments: [],
              createdAt: null,
              error: "Gagal mengambil detail pesan",
            } satisfies TempMailMessage;
          }

          try {
            const detailResponse = await requestTempMail({
              uri: `${this.api.base}${this.api.messages}/${messageId}`,
              method: "GET",
              headers: {
                authorization: `Bearer ${token}`,
                origin: "https://temp-mail.org",
                referer: "https://temp-mail.org/",
              },
            });

            const detail = toRecord(detailResponse);
            return {
              id: toStringValue(detail?._id) || messageId,
              receivedAt: toNumberValue(detail?.receivedAt),
              from: toStringValue(detail?.from),
              subject: toStringValue(detail?.subject),
              bodyPreview: toStringValue(detail?.bodyPreview),
              bodyHtml: toStringValue(detail?.bodyHtml) || null,
              attachmentsCount: toNumberValue(detail?.attachmentsCount) || 0,
              attachments: Array.isArray(detail?.attachments) ? detail.attachments : [],
              createdAt: toStringValue(detail?.createdAt) || null,
            } satisfies TempMailMessage;
          } catch {
            return {
              id: messageId,
              receivedAt: toNumberValue(item?.receivedAt),
              from: toStringValue(item?.from),
              subject: toStringValue(item?.subject),
              bodyPreview: toStringValue(item?.bodyPreview),
              bodyHtml: null,
              attachmentsCount: toNumberValue(item?.attachmentsCount) || 0,
              attachments: [],
              createdAt: null,
              error: "Gagal mengambil detail pesan",
            } satisfies TempMailMessage;
          }
        }),
      );

      return {
        success: true,
        result: {
          email,
          messages: detailedMessages,
        },
      };
    } catch (error) {
      return {
        success: false,
        result: error instanceof Error ? error.message : "Unknown error",
      };
    }
  },
};

function mapSourceError(message: string) {
  const normalized = message.toLowerCase();

  if (normalized.includes("enotfound") || normalized.includes("dns")) {
    return errorResponse(503, "Source host unavailable (DNS lookup failed). Please retry later.");
  }
  if (normalized.includes("econnrefused") || normalized.includes("econnreset")) {
    return errorResponse(503, "Source service temporarily unavailable. Please retry later.");
  }
  if (normalized.includes("timeout") || normalized.includes("etimedout") || normalized.includes("econnaborted")) {
    return errorResponse(504, "Source request timeout. Please retry later.");
  }
  if (normalized.includes("token")) {
    return errorResponse(400, message);
  }

  const compact = message.length > 240 ? `${message.slice(0, 240)}...` : message;
  return errorResponse(502, `Failed to fetch data from source. ${compact}`);
}

function parseAction(raw: string | null) {
  const value = (raw || "generate").trim().toLowerCase();
  if (value === "generate") {
    return "generate" as const;
  }
  if (value === "inbox") {
    return "inbox" as const;
  }
  return null;
}

export async function handleTempMailRequest(url: URL) {
  const endpoint = await getApiEndpointStatusBySlug("temp-mail");
  if (endpoint?.status === "NON_ACTIVE") {
    return errorResponse(503, "Endpoint is currently non-active.");
  }

  if (endpoint?.status === "MAINTENANCE") {
    return errorResponse(503, "Endpoint is under maintenance.");
  }

  const action = parseAction(url.searchParams.get("action"));
  const apiKeyValue = (url.searchParams.get("apikey") || "").trim();
  const token = (url.searchParams.get("token") || "").trim();

  if (!action) {
    return errorResponse(400, "Query parameter 'action' must be 'generate' or 'inbox'.");
  }

  if (!apiKeyValue) {
    return errorResponse(400, "Query parameter 'apikey' is required.");
  }

  if (action === "inbox" && !token) {
    return errorResponse(400, "Query parameter 'token' is required for inbox action.");
  }

  const apiKey = await prisma.apiKey.findUnique({
    where: { key: apiKeyValue },
    include: {
      user: {
        select: {
          id: true,
          referralBonusDaily: true,
          isBlocked: true,
          blockedAt: true,
          banUntil: true,
          banReason: true,
        },
      },
    },
  });

  if (!apiKey) {
    return errorResponse(401, "Invalid API key.");
  }

  if (apiKey.status !== "ACTIVE") {
    return errorResponse(403, "API key is not active.");
  }

  const normalizedBan = await normalizeUserBanState(prisma, {
    id: apiKey.user.id,
    isBlocked: apiKey.user.isBlocked,
    blockedAt: apiKey.user.blockedAt,
    banUntil: apiKey.user.banUntil,
    banReason: apiKey.user.banReason,
  });

  if (normalizedBan.isBlocked) {
    const banInfo = buildBanInfo({
      isBlocked: normalizedBan.isBlocked,
      blockedAt: normalizedBan.blockedAt,
      banUntil: normalizedBan.banUntil,
      banReason: normalizedBan.banReason,
    });
    return errorResponse(403, banInfo.message || "User account is blocked.");
  }

  const effectiveLimit = apiKey.dailyLimit + apiKey.user.referralBonusDaily;
  const usageDate = getUtcDateOnly(new Date());

  const usageResult = await prisma.$transaction(async (tx) => {
    const existingUsage = await tx.usageLog.findUnique({
      where: {
        apiKeyId_date: {
          apiKeyId: apiKey.id,
          date: usageDate,
        },
      },
      select: {
        requestsCount: true,
      },
    });

    const usedCount = existingUsage?.requestsCount ?? 0;
    if (usedCount >= effectiveLimit) {
      return { limited: true, usedCount };
    }

    if (existingUsage) {
      const updated = await tx.usageLog.update({
        where: {
          apiKeyId_date: {
            apiKeyId: apiKey.id,
            date: usageDate,
          },
        },
        data: {
          requestsCount: {
            increment: 1,
          },
        },
        select: {
          requestsCount: true,
        },
      });

      return { limited: false, usedCount: updated.requestsCount };
    }

    const created = await tx.usageLog.create({
      data: {
        apiKeyId: apiKey.id,
        date: usageDate,
        requestsCount: 1,
      },
      select: {
        requestsCount: true,
      },
    });

    return { limited: false, usedCount: created.requestsCount };
  });

  if (usageResult.limited) {
    return errorResponse(429, "Daily limit reached.");
  }

  const sourceResult = action === "generate" ? await tempMail.generate() : await tempMail.inbox(token);
  if (!sourceResult.success) {
    return mapSourceError(sourceResult.result);
  }

  const remainingLimit = Math.max(effectiveLimit - usageResult.usedCount, 0);

  return NextResponse.json(
    {
      status: true,
      code: 200,
      creator: CREATOR,
      action,
      result: sourceResult.result,
      remaining_limit: remainingLimit,
    },
    { status: 200 },
  );
}
