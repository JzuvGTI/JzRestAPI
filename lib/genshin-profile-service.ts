import axios from "axios";
import { load } from "cheerio";
import { NextResponse } from "next/server";

import { getApiEndpointStatusBySlug } from "@/lib/api-endpoints";
import { buildBanInfo, normalizeUserBanState } from "@/lib/ban";
import { prisma } from "@/lib/prisma";

const CREATOR = "JzProject";
const ENKA_BASE_URL = "https://enka.network";
const REQUEST_TIMEOUT_MS = 30000;

type TalentLevel = {
  level: number;
};

type WeaponData = {
  name: string;
  level: number;
  maxLevel: number;
  refinement: number;
  icon: string;
  stars: number;
  baseAtk: string | number;
  substat: string | null;
};

type ArtifactData = {
  slot: string;
  level: number;
  stars: number;
  mainStat: {
    value: string;
  };
  substats: Array<{
    value: string;
  }>;
  setName?: string;
};

type CardStats = {
  hp?: number;
  hpBase?: number;
  hpBonus?: number;
  atk?: number;
  atkBase?: number;
  atkBonus?: number;
  def?: number;
  defBase?: number;
  defBonus?: number;
  em?: number;
  cr?: number;
  cd?: number;
  er?: number;
  elementalDmg?: number;
  physicalDmg?: number;
};

type CharacterCard = {
  name: string;
  level: number;
  maxLevel: number;
  friendship: number;
  uid: string;
  constellation: number;
  talents: TalentLevel[];
  weapon: WeaponData | null;
  artifacts: ArtifactData[];
  stats: CardStats;
};

type CharacterData = {
  id: number;
  name: string;
  level: number;
  icon: string;
  constellation: number;
  talents: TalentLevel[];
  weapon: WeaponData | null;
  artifacts: ArtifactData[];
  stats: CardStats;
  card: CharacterCard | null;
};

type ProfileResult = {
  uid: string;
  playerInfo: {
    nickname: string;
    level: number;
    signature: string;
    worldLevel: number;
    achievements: number;
    spiralAbyss: string;
    theater: string;
    stygianOnslaught: string;
    avatar: string;
  };
  characters: CharacterData[];
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

function cleanText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function normalizeNameKey(value: string) {
  return cleanText(value).toLowerCase().replace(/[^a-z0-9]/g, "");
}

function toAbsoluteEnkaUrl(value: string) {
  const raw = value.trim();
  if (!raw) {
    return "";
  }

  if (raw.startsWith("http://") || raw.startsWith("https://")) {
    return raw;
  }

  if (raw.startsWith("//")) {
    return `https:${raw}`;
  }

  if (raw.startsWith("/")) {
    return `${ENKA_BASE_URL}${raw}`;
  }

  return `${ENKA_BASE_URL}/${raw}`;
}

function parseIntSafe(value: string) {
  const numeric = Number.parseInt(value.replace(/[^\d-]/g, ""), 10);
  return Number.isFinite(numeric) ? numeric : 0;
}

function parseFloatSafe(value: string) {
  const numeric = Number.parseFloat(value.replace(/[^\d.-]/g, ""));
  return Number.isFinite(numeric) ? numeric : 0;
}

function parsePlusParts(value: string) {
  const normalized = value.replace(/,/g, "");
  const match = normalized.match(/(\d+)\s*\+\s*(\d+)/);
  if (!match) {
    return { base: 0, bonus: 0 };
  }
  return {
    base: Number.parseInt(match[1], 10) || 0,
    bonus: Number.parseInt(match[2], 10) || 0,
  };
}

function mapCharacterByCardName(characters: CharacterData[], cardName: string) {
  const cardKey = normalizeNameKey(cardName);
  if (!cardKey) {
    return null;
  }

  return (
    characters.find((character) => {
      const nameKey = normalizeNameKey(character.name);
      return nameKey && (cardKey.includes(nameKey) || nameKey.includes(cardKey));
    }) || null
  );
}

async function scrapeEnkaProfile(uid: string): Promise<ProfileResult> {
  const url = `${ENKA_BASE_URL}/u/${uid}/`;
  const response = await axios.get<string>(url, {
    timeout: REQUEST_TIMEOUT_MS,
    headers: {
      "user-agent":
        "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Mobile Safari/537.36",
      accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "accept-language": "en-US,en;q=0.9,id;q=0.8",
      referer: ENKA_BASE_URL,
    },
  });

  const $ = load(response.data);

  const result: ProfileResult = {
    uid,
    playerInfo: {
      nickname: "",
      level: 0,
      signature: "",
      worldLevel: 0,
      achievements: 0,
      spiralAbyss: "",
      theater: "",
      stygianOnslaught: "",
      avatar: "",
    },
    characters: [],
  };

  const nickname =
    cleanText($("h1.svelte-ea8b6b").first().text()) || cleanText($("h1").first().text());
  if (nickname) {
    result.playerInfo.nickname = nickname;
  }

  const arText = cleanText($(".ar.svelte-ea8b6b").first().text()) || cleanText($(".ar").first().text());
  const arMatch = arText.match(/AR\s*(\d+)/i);
  if (arMatch) {
    result.playerInfo.level = Number.parseInt(arMatch[1], 10) || 0;
  }
  const wlMatch = arText.match(/WL\s*(\d+)/i);
  if (wlMatch) {
    result.playerInfo.worldLevel = Number.parseInt(wlMatch[1], 10) || 0;
  }

  const signature =
    cleanText($(".signature.svelte-ea8b6b").first().text()) || cleanText($(".signature").first().text());
  if (signature) {
    result.playerInfo.signature = signature;
  }

  const avatarImg =
    $(".avatar-icon img").first().attr("src") ||
    $(".avatar-icon img").first().attr("data-src") ||
    "";
  if (avatarImg) {
    result.playerInfo.avatar = toAbsoluteEnkaUrl(avatarImg);
  }

  $(".stat.svelte-1dtsens, .stat").each((_, element) => {
    const td = $(element).find("td");
    const value = cleanText($(td[0]).text());
    const label = cleanText($(td[2]).text());

    if (label.includes("Total Achievement")) {
      result.playerInfo.achievements = parseIntSafe(value);
    } else if (label.includes("Spiral Abyss")) {
      result.playerInfo.spiralAbyss = value;
    } else if (label.includes("Imaginarium Theater")) {
      result.playerInfo.theater = value;
    } else if (label.includes("Stygian Onslaught")) {
      result.playerInfo.stygianOnslaught = value;
    }
  });

  $(".avatar.live").each((index, element) => {
    const imgStyle = $(element).find(".chara").attr("style") || "";
    const bgMatch = imgStyle.match(/url\(['"]?([^'")]+)['"]?\)/i);
    const nameMatch = imgStyle.match(/Side[._]([A-Za-z0-9_]+)/i);
    const levelText = cleanText($(element).find(".level").text());

    result.characters.push({
      id: index + 1,
      name: nameMatch ? nameMatch[1] : "",
      level: parseIntSafe(levelText),
      icon: bgMatch ? toAbsoluteEnkaUrl(bgMatch[1]) : "",
      constellation: 0,
      talents: [],
      weapon: null,
      artifacts: [],
      stats: {},
      card: null,
    });
  });

  $(".card-scroll .Card, .Card").each((_, cardElement) => {
    const card = $(cardElement);
    const rawCardName = cleanText(card.find(".name").first().text());
    const cardName = cleanText(rawCardName.replace("▴", "").replace("wibutzy", ""));
    if (!cardName) {
      return;
    }

    let character = mapCharacterByCardName(result.characters, cardName);
    if (!character) {
      character = {
        id: result.characters.length + 1,
        name: cardName,
        level: 0,
        icon: "",
        constellation: 0,
        talents: [],
        weapon: null,
        artifacts: [],
        stats: {},
        card: null,
      };
      result.characters.push(character);
    }

    const levelMatch = cleanText(card.find(".level").first().text()).match(/Lv\.\s*(\d+)\s*\/\s*(\d+)/i);
    const friendshipText = cleanText(card.find(".fren").first().text());
    const friendship = parseIntSafe(friendshipText);

    const cardData: CharacterCard = {
      name: cardName,
      level: levelMatch ? Number.parseInt(levelMatch[1], 10) || 0 : 0,
      maxLevel: levelMatch ? Number.parseInt(levelMatch[2], 10) || 0 : 0,
      friendship,
      uid: cleanText(card.find(".uid").first().text()) || uid,
      constellation: card.find(".Consts .icon img, .Consts .icon").length || 0,
      talents: [],
      weapon: null,
      artifacts: [],
      stats: {},
    };

    const talents: TalentLevel[] = [];
    card.find(".Talents .icon .level").each((_, element) => {
      const levelText = cleanText($(element).text()).replace("up", "");
      talents.push({
        level: parseIntSafe(levelText),
      });
    });
    cardData.talents = talents;

    const weaponName = cleanText(card.find(".Weapon .title span").first().text());
    if (weaponName) {
      const weaponLevelText = cleanText(card.find(".Weapon .level").first().text());
      const weaponLevelMatch = weaponLevelText.match(/Lv\.\s*(\d+)\s*\/\s*(\d+)/i);
      const weaponRefineText = cleanText(card.find(".Weapon .refine").first().text());
      const weaponRefineMatch = weaponRefineText.match(/R(\d+)/i);
      const weaponIcon = toAbsoluteEnkaUrl(card.find(".Weapon .WeaponIcon").first().attr("src") || "");
      const weaponStars = card.find(".Weapon .Stars span").length || 0;
      const weaponStats: string[] = [];

      card.find(".Weapon .stats .Substat").each((_, element) => {
        const value = cleanText($(element).find("span").last().text());
        if (value) {
          weaponStats.push(value);
        }
      });

      cardData.weapon = {
        name: weaponName,
        level: weaponLevelMatch ? Number.parseInt(weaponLevelMatch[1], 10) || 0 : 0,
        maxLevel: weaponLevelMatch ? Number.parseInt(weaponLevelMatch[2], 10) || 0 : 0,
        refinement: weaponRefineMatch ? Number.parseInt(weaponRefineMatch[1], 10) || 1 : 1,
        icon: weaponIcon,
        stars: weaponStars,
        baseAtk: weaponStats[0] || 0,
        substat: weaponStats[1] || null,
      };
    }

    const stats: CardStats = {};
    card.find(".StatsTable .row").each((_, element) => {
      const label = cleanText($(element).find(".mid span:first-child").text());
      const value = cleanText($(element).find(".mid span:last-child").text()).replace(",", "");
      const subValue = cleanText($(element).find(".small span span").text()).replace(",", "");

      if (label === "HP") {
        stats.hp = parseIntSafe(value);
        const plus = parsePlusParts(subValue);
        stats.hpBase = plus.base;
        stats.hpBonus = plus.bonus;
      } else if (label === "ATK") {
        stats.atk = parseIntSafe(value);
        const plus = parsePlusParts(subValue);
        stats.atkBase = plus.base;
        stats.atkBonus = plus.bonus;
      } else if (label === "DEF") {
        stats.def = parseIntSafe(value);
        const plus = parsePlusParts(subValue);
        stats.defBase = plus.base;
        stats.defBonus = plus.bonus;
      } else if (label === "Elemental Mastery") {
        stats.em = parseIntSafe(value);
      } else if (label === "CRIT Rate") {
        stats.cr = parseFloatSafe(value);
      } else if (label === "CRIT DMG") {
        stats.cd = parseFloatSafe(value);
      } else if (label === "Energy Recharge") {
        stats.er = parseFloatSafe(value);
      } else if (label.includes("DMG Bonus")) {
        if (label.includes("Physical")) {
          stats.physicalDmg = parseFloatSafe(value);
        } else {
          stats.elementalDmg = parseFloatSafe(value);
        }
      }
    });
    cardData.stats = stats;

    const artifactSlots = ["Flower", "Plume", "Sands", "Goblet", "Circlet"];
    const artifacts: ArtifactData[] = [];
    card.find(".Artifact").each((index, element) => {
      const mainStatValue = cleanText($(element).find(".mainstat .svelte-14f9a6o").first().text());
      const stars = $(element).find(".Stars span").length || 0;
      const levelText = cleanText($(element).find(".level").text()).replace("+", "");

      const substats: Array<{ value: string }> = [];
      $(element)
        .find(".substats .Substat")
        .each((_, subElement) => {
          const value = cleanText($(subElement).find("span").last().text());
          if (value) {
            substats.push({ value });
          }
        });

      artifacts.push({
        slot: artifactSlots[index] || "",
        level: parseIntSafe(levelText),
        stars,
        mainStat: {
          value: mainStatValue,
        },
        substats,
      });
    });

    const setName = cleanText(card.find(".set .desc").text());
    if (setName) {
      artifacts.forEach((artifact) => {
        artifact.setName = setName;
      });
    }

    cardData.artifacts = artifacts;
    character.card = cardData;
  });

  return result;
}

export async function handleGenshinProfileRequest(url: URL) {
  const endpoint = await getApiEndpointStatusBySlug("genshin-profile");
  if (endpoint?.status === "NON_ACTIVE") {
    return errorResponse(503, "Endpoint is currently non-active.");
  }

  if (endpoint?.status === "MAINTENANCE") {
    return errorResponse(503, "Endpoint is under maintenance.");
  }

  const uid = (url.searchParams.get("uid") || "").trim();
  const apiKeyValue = (url.searchParams.get("apikey") || "").trim();

  if (!uid) {
    return errorResponse(400, "Query parameter 'uid' is required.");
  }

  if (!/^\d{6,16}$/.test(uid)) {
    return errorResponse(400, "Query parameter 'uid' must contain 6-16 digits.");
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

  let profile: ProfileResult;
  try {
    profile = await scrapeEnkaProfile(uid);
  } catch {
    return errorResponse(502, "Failed to fetch data from source.");
  }

  const remainingLimit = Math.max(effectiveLimit - usageResult.usedCount, 0);

  return NextResponse.json(
    {
      status: true,
      code: 200,
      creator: CREATOR,
      result: profile,
      total_characters: profile.characters.length,
      remaining_limit: remainingLimit,
    },
    { status: 200 },
  );
}
