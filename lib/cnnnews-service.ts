import axios from "axios";
import { load } from "cheerio";
import { NextResponse } from "next/server";

import { getApiEndpointStatusBySlug } from "@/lib/api-endpoints";
import { buildBanInfo, normalizeUserBanState } from "@/lib/ban";
import { prisma } from "@/lib/prisma";

const CREATOR = "JzProject";
const CNN_BASE_URL = "https://www.cnnindonesia.com";
const HTTP_TIMEOUT_MS = 30000;

type HomeNewsItem = {
  url: string;
  title: string;
  image: string;
  category: string;
};

type CnnDetail = {
  title: string;
  date: string;
  author: string;
  content: string[];
  tags: string[];
};

type CnnNewsResultItem = {
  news: HomeNewsItem;
  detail: CnnDetail;
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

function getAxiosHeaders() {
  return {
    "user-agent":
      "Mozilla/5.0 (Linux; Android 6.0; Nexus 5 Build/MRA58N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Mobile Safari/537.36",
    accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "accept-language": "id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7",
    referer: CNN_BASE_URL,
  };
}

function toAbsoluteUrl(value: string) {
  const raw = value.trim();
  if (!raw || raw === "#") {
    return "";
  }

  if (raw.startsWith("//")) {
    return `https:${raw}`;
  }

  if (raw.startsWith("/")) {
    return `${CNN_BASE_URL}${raw}`;
  }

  if (/^https?:\/\//i.test(raw)) {
    return raw;
  }

  return "";
}

function normalizeImageUrl(value: string | undefined) {
  const raw = (value || "").trim();
  if (!raw) {
    return "";
  }

  return toAbsoluteUrl(raw) || raw;
}

function cleanContentParagraph(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function parseHomeNews(html: string) {
  const $ = load(html);
  const newsList: HomeNewsItem[] = [];
  const seen = new Set<string>();

  const appendItem = (url: string, title: string, image: string, category: string) => {
    if (!url || !title || seen.has(url)) {
      return;
    }
    seen.add(url);
    newsList.push({
      url,
      title,
      image,
      category,
    });
  };

  $(".nhl-list article").each((_, element) => {
    const article = $(element);
    const link = article.find("a[href]").first();
    const url = toAbsoluteUrl(link.attr("href") || "");
    const title =
      cleanContentParagraph(link.find("h2").first().text()) ||
      cleanContentParagraph(article.find("h2").first().text());
    const image = normalizeImageUrl(
      article.find("img").first().attr("src") ||
        article.find("img").first().attr("data-src") ||
        article.find("img").first().attr("data-original"),
    );
    const category = cleanContentParagraph(article.find(".text-cnn_red").first().text());

    appendItem(url, title, image, category);
  });

  if (newsList.length === 0) {
    $("article").each((_, element) => {
      const article = $(element);
      const link = article.find("a[href]").first();
      const url = toAbsoluteUrl(link.attr("href") || "");
      if (!url.includes("cnnindonesia.com")) {
        return;
      }

      const title =
        cleanContentParagraph(article.find("h2").first().text()) ||
        cleanContentParagraph(article.find("h3").first().text()) ||
        cleanContentParagraph(link.text());
      const image = normalizeImageUrl(
        article.find("img").first().attr("src") ||
          article.find("img").first().attr("data-src") ||
          article.find("img").first().attr("data-original"),
      );
      const category = cleanContentParagraph(article.find(".text-cnn_red").first().text());

      appendItem(url, title, image, category);
    });
  }

  return newsList.slice(0, 3);
}

function parseArticleDetail(html: string, fallbackTitle: string): CnnDetail {
  const $ = load(html);

  const detailTitle = cleanContentParagraph($("h1").first().text()) || fallbackTitle;
  const detailDate =
    cleanContentParagraph($(".text-cnn_grey.text-sm").first().text()) ||
    cleanContentParagraph($("time").first().text()) ||
    "";
  const detailAuthor =
    cleanContentParagraph($(".text-cnn_red").first().text()) ||
    cleanContentParagraph($("[class*='author']").first().text()) ||
    "";

  let paragraphs = $(".detail-text p")
    .toArray()
    .map((element) => cleanContentParagraph($(element).text()))
    .filter((text) => text && !text.includes("BACA JUGA:"));

  if (paragraphs.length === 0) {
    paragraphs = $("article p")
      .toArray()
      .map((element) => cleanContentParagraph($(element).text()))
      .filter((text) => text && !text.includes("BACA JUGA:"));
  }

  const tags = $(".flex.flex-wrap.gap-3 a")
    .toArray()
    .map((element) => cleanContentParagraph($(element).text()))
    .filter(Boolean)
    .slice(0, 3);

  return {
    title: detailTitle,
    date: detailDate,
    author: detailAuthor,
    content: paragraphs.slice(0, 3),
    tags,
  };
}

async function scrapeCnnNews() {
  const homeResponse = await axios.get<string>(CNN_BASE_URL, {
    timeout: HTTP_TIMEOUT_MS,
    headers: getAxiosHeaders(),
  });
  const homeNews = parseHomeNews(homeResponse.data);

  const results: CnnNewsResultItem[] = [];

  for (const item of homeNews) {
    try {
      const articleResponse = await axios.get<string>(item.url, {
        timeout: HTTP_TIMEOUT_MS,
        headers: getAxiosHeaders(),
      });

      const detail = parseArticleDetail(articleResponse.data, item.title);
      results.push({
        news: item,
        detail,
      });
    } catch {
      continue;
    }
  }

  return {
    news: results,
  };
}

export async function handleCnnNewsRequest(url: URL) {
  const endpoint = await getApiEndpointStatusBySlug("cnn-news");
  if (endpoint?.status === "NON_ACTIVE") {
    return errorResponse(503, "Endpoint is currently non-active.");
  }

  if (endpoint?.status === "MAINTENANCE") {
    return errorResponse(503, "Endpoint is under maintenance.");
  }

  const apiKeyValue = (url.searchParams.get("apikey") || "").trim();
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

  let result: { news: CnnNewsResultItem[] };
  try {
    result = await scrapeCnnNews();
  } catch {
    return errorResponse(502, "Failed to fetch data from source.");
  }

  const remainingLimit = Math.max(effectiveLimit - usageResult.usedCount, 0);

  return NextResponse.json(
    {
      status: true,
      code: 200,
      creator: CREATOR,
      result,
      total_news: result.news.length,
      remaining_limit: remainingLimit,
    },
    { status: 200 },
  );
}
