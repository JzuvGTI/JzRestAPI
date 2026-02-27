import axios from "axios";
import { load } from "cheerio";
import { NextResponse } from "next/server";

import { getApiEndpointStatusBySlug } from "@/lib/api-endpoints";
import { buildBanInfo, normalizeUserBanState } from "@/lib/ban";
import { prisma } from "@/lib/prisma";

const CREATOR = "JzProject";
const SFILE_HOST = "sfile.mobi";
const SFILE_BASE_URL = "https://sfile.mobi";

type SfileResult = {
  source_url: string;
  name: string;
  uploaded_by: string;
  uploaded_at: string;
  downloads: number;
  file_type: string;
  download_url: string;
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

function normalizeSfileUrl(value: string) {
  try {
    const parsed = new URL(value);
    const protocol = parsed.protocol.toLowerCase();
    const hostname = parsed.hostname.toLowerCase();

    if (protocol !== "http:" && protocol !== "https:") {
      return null;
    }

    const isSfile = hostname === SFILE_HOST || hostname.endsWith(`.${SFILE_HOST}`);
    if (!isSfile) {
      return null;
    }

    return parsed.toString();
  } catch {
    return null;
  }
}

function parseTrailingValue(value: string) {
  const cleaned = value.replace(/\s+/g, " ").trim();
  const match = cleaned.match(/[-:]\s*(.+)$/);
  if (match) {
    return match[1].trim();
  }
  return cleaned;
}

function parseDownloadCount(value: string) {
  const onlyDigits = value.replace(/[^\d]/g, "");
  const parsed = Number.parseInt(onlyDigits, 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toAbsoluteUrl(value: string, base: string) {
  try {
    return new URL(value, base).toString();
  } catch {
    return "";
  }
}

function getCookieHeaderFromSetCookie(setCookieHeader: unknown) {
  if (!setCookieHeader) {
    return "";
  }

  const asArray = Array.isArray(setCookieHeader) ? setCookieHeader : [setCookieHeader];
  return asArray
    .map((item) => String(item).split(";")[0].trim())
    .filter(Boolean)
    .join("; ");
}

function decodeEscapedUrl(value: string) {
  try {
    return JSON.parse(`"${value}"`) as string;
  } catch {
    return value;
  }
}

async function scrapeSfile(url: string): Promise<SfileResult> {
  const headers = {
    authority: "sfile.mobi",
    accept:
      "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
    "accept-language": "ms-MY,ms;q=0.9,en-US;q=0.8,en;q=0.7",
    "cache-control": "max-age=0",
    referer: "https://sfile.mobi/uploads.php",
    "sec-ch-ua": '"Not A(Brand";v="8", "Chromium";v="132"',
    "sec-ch-ua-mobile": "?1",
    "sec-ch-ua-platform": '"Android"',
    "sec-fetch-dest": "document",
    "sec-fetch-mode": "navigate",
    "sec-fetch-site": "same-origin",
    "sec-fetch-user": "?1",
    "upgrade-insecure-requests": "1",
    "user-agent":
      "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Mobile Safari/537.36",
  };

  const response = await axios.get<string>(url, {
    headers,
    timeout: 30000,
    maxRedirects: 5,
  });

  const $ = load(response.data);
  const fileContent = $(".file-content").first();
  if (fileContent.length === 0) {
    throw new Error("SFILE_CONTENT_NOT_FOUND");
  }

  const name = fileContent.find("h1.intro").first().text().trim();
  const listItems = fileContent.find(".list");
  const fileType = parseTrailingValue(listItems.eq(0).text());
  const uploadedBy = listItems.eq(1).find("a").first().text().trim();
  const uploadedAt = parseTrailingValue(listItems.eq(2).text());
  const downloads = parseDownloadCount(listItems.eq(3).text());

  const firstDownloadUrl = $("#download").attr("href") || "";
  const firstDownloadUrlAbsolute = toAbsoluteUrl(firstDownloadUrl, url);
  if (!firstDownloadUrlAbsolute) {
    throw new Error("SFILE_DOWNLOAD_LINK_NOT_FOUND");
  }

  const cookieHeader = getCookieHeaderFromSetCookie(response.headers["set-cookie"]);
  const secondResponse = await axios.get<string>(firstDownloadUrlAbsolute, {
    headers: {
      ...headers,
      ...(cookieHeader ? { cookie: cookieHeader } : {}),
    },
    timeout: 30000,
    maxRedirects: 5,
  });

  const $$ = load(secondResponse.data);
  const scripts = $$("script").toArray();

  let finalDownloadUrl = "";
  for (const script of scripts) {
    const content = $$(script).html() || "";
    const match = content.match(/sf\s*=\s*"([^"]+)"/);
    if (!match) {
      continue;
    }

    const decoded = decodeEscapedUrl(match[1]);
    finalDownloadUrl = toAbsoluteUrl(decoded, SFILE_BASE_URL);
    if (finalDownloadUrl) {
      break;
    }
  }

  if (!finalDownloadUrl) {
    throw new Error("SFILE_FINAL_LINK_NOT_FOUND");
  }

  return {
    source_url: url,
    name: name || "Unknown file",
    uploaded_by: uploadedBy || "",
    uploaded_at: uploadedAt || "",
    downloads,
    file_type: fileType || "",
    download_url: finalDownloadUrl,
  };
}

export async function handleSfileMobiDownloadRequest(url: URL) {
  const endpoint = await getApiEndpointStatusBySlug("sfilemobi-dl");
  if (endpoint?.status === "NON_ACTIVE") {
    return errorResponse(503, "Endpoint is currently non-active.");
  }

  if (endpoint?.status === "MAINTENANCE") {
    return errorResponse(503, "Endpoint is under maintenance.");
  }

  const targetUrl = (url.searchParams.get("url") || "").trim();
  const apiKeyValue = (url.searchParams.get("apikey") || "").trim();

  if (!targetUrl) {
    return errorResponse(400, "Query parameter 'url' is required.");
  }

  const normalizedUrl = normalizeSfileUrl(targetUrl);
  if (!normalizedUrl) {
    return errorResponse(400, "Query parameter 'url' must be a valid sfile.mobi URL.");
  }

  if (!apiKeyValue) {
    return errorResponse(400, "Query parameter 'apikey' is required.");
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

  let result: SfileResult;
  try {
    result = await scrapeSfile(normalizedUrl);
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.status === 404) {
      return errorResponse(404, "File not found.");
    }
    return errorResponse(502, "Failed to fetch data from source.");
  }

  const remainingLimit = Math.max(effectiveLimit - usageResult.usedCount, 0);

  return NextResponse.json(
    {
      status: true,
      code: 200,
      creator: CREATOR,
      result,
      remaining_limit: remainingLimit,
    },
    { status: 200 },
  );
}
