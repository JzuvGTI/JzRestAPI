const COUNTRY_TIMEZONE_MAP: Record<string, string> = {
  id: "Asia/Jakarta",
  sg: "Asia/Singapore",
  my: "Asia/Kuala_Lumpur",
  th: "Asia/Bangkok",
  vn: "Asia/Ho_Chi_Minh",
  ph: "Asia/Manila",
  jp: "Asia/Tokyo",
  kr: "Asia/Seoul",
  cn: "Asia/Shanghai",
  tw: "Asia/Taipei",
  in: "Asia/Kolkata",
  ae: "Asia/Dubai",
  sa: "Asia/Riyadh",
  gb: "Europe/London",
  de: "Europe/Berlin",
  fr: "Europe/Paris",
  it: "Europe/Rome",
  nl: "Europe/Amsterdam",
  tr: "Europe/Istanbul",
  ru: "Europe/Moscow",
  us: "America/New_York",
  ca: "America/Toronto",
  mx: "America/Mexico_City",
  br: "America/Sao_Paulo",
  ar: "America/Argentina/Buenos_Aires",
  au: "Australia/Sydney",
  nz: "Pacific/Auckland",
  za: "Africa/Johannesburg",
  eg: "Africa/Cairo",
};

export function resolveCountryTimezone(countryCode: string) {
  return COUNTRY_TIMEZONE_MAP[countryCode.toLowerCase()] ?? null;
}

function getPartValue(parts: Intl.DateTimeFormatPart[], type: Intl.DateTimeFormatPartTypes) {
  return parts.find((part) => part.type === type)?.value ?? "";
}

export function buildCountryTimePayload(countryCode: string, timezone: string) {
  const now = new Date();

  const dateParts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);

  const timeParts = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(now);

  const dayName = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "long",
  }).format(now);

  const offsetLabel =
    new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      timeZoneName: "shortOffset",
      hour: "2-digit",
      hour12: false,
    })
      .formatToParts(now)
      .find((part) => part.type === "timeZoneName")
      ?.value ?? "GMT";

  return {
    country: countryCode.toUpperCase(),
    timezone,
    day_name: dayName,
    local_date: `${getPartValue(dateParts, "year")}-${getPartValue(dateParts, "month")}-${getPartValue(dateParts, "day")}`,
    local_time: `${getPartValue(timeParts, "hour")}:${getPartValue(timeParts, "minute")}:${getPartValue(timeParts, "second")}`,
    utc_offset: offsetLabel,
    unix: Math.floor(now.getTime() / 1000),
  };
}
