const RAIDER_IO_PROFILE_URL = "https://raider.io/api/v1/characters/profile";
const RAIDER_IO_RAID_STATIC_URL = "https://raider.io/api/v1/raiding/static-data";
const RAIDER_IO_MPLUS_STATIC_URL = "https://raider.io/api/v1/mythic-plus/static-data";
const STATIC_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const EXPANSION_IDS = [12, 11, 10, 9] as const;

export interface RaiderIoRequest {
  region: string;
  realm: string;
  name: string;
}

export interface CharacterSummary {
  name: string;
  region: string;
  realm: string;
  profileUrl: string;
  thumbnailUrl?: string;
  raidTiers: RaidTierSummary[];
  mythicPlusSeasons: MythicPlusSeasonSummary[];
}

export interface RaidTierSummary {
  slug: string;
  label: string;
  normal: string;
  heroic: string;
  mythic: string;
  totalBosses: number | null;
  hasExperience: boolean;
}

export interface MythicPlusSeasonSummary {
  slug: string;
  label: string;
  score: number | null;
}

interface ProgressionSelection {
  raidTiers: Array<{ slug: string; label: string }>;
  mythicPlusSeasons: Array<{ slug: string; label: string }>;
}

interface RaiderIoProfileResponse {
  name?: string;
  region?: string;
  realm?: string;
  profile_url?: string;
  thumbnail_url?: string;
  raid_progression?: Record<
    string,
    {
      total_bosses?: number;
      normal_bosses_killed?: number;
      heroic_bosses_killed?: number;
      mythic_bosses_killed?: number;
    }
  >;
  mythic_plus_scores_by_season?: Array<{
    season?: string;
    scores?: {
      all?: number;
    };
  }>;
}

interface StaticRaidDataResponse {
  raids?: Array<{
    slug?: string;
    name?: string;
    starts?: Record<string, string>;
    encounters?: unknown[];
  }>;
}

interface StaticMythicPlusDataResponse {
  seasons?: Array<{
    slug?: string;
    name?: string;
    is_main_season?: boolean;
    starts?: Record<string, string>;
  }>;
}

const progressionSelectionCache = new Map<string, { value: ProgressionSelection; expiresAt: number }>();

function formatKillString(kills: number | undefined, total: number | null): string {
  if (typeof kills !== "number" || !Number.isFinite(kills)) {
    return "N/A";
  }
  if (kills <= 0) {
    return "N/A";
  }
  if (typeof total === "number" && Number.isFinite(total)) {
    return `${kills}/${total}`;
  }
  return `${kills}/N/A`;
}

function parseDateByRegion(starts: Record<string, string> | undefined, region: string): number {
  if (!starts) return 0;
  const regionDate = starts[region.toLowerCase()] ?? starts.us ?? Object.values(starts)[0];
  const timestamp = Date.parse(regionDate ?? "");
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function isCanonicalMainSeasonSlug(slug: string): boolean {
  return /^season-[a-z]+-\d+$/i.test(slug);
}

function isRaidWithMajorSize(encounters: unknown[] | undefined): boolean {
  return Array.isArray(encounters) && encounters.length >= 8;
}

function dedupeBySlug(items: Array<{ slug: string; label: string; startsAt: number }>) {
  const map = new Map<string, { slug: string; label: string; startsAt: number }>();
  for (const item of items) {
    const existing = map.get(item.slug);
    if (!existing || item.startsAt > existing.startsAt) {
      map.set(item.slug, item);
    }
  }
  return [...map.values()];
}

async function fetchJsonOrNull<T>(url: string): Promise<T | null> {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "zbot2/0.1.0",
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    return null;
  }

  return (await response.json()) as T;
}

async function loadProgressionSelection(region: string): Promise<ProgressionSelection> {
  const cached = progressionSelectionCache.get(region);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  const raidCandidates: Array<{ slug: string; label: string; startsAt: number }> = [];
  const mplusCandidates: Array<{ slug: string; label: string; startsAt: number }> = [];

  for (const expansionId of EXPANSION_IDS) {
    const [raidData, mplusData] = await Promise.all([
      fetchJsonOrNull<StaticRaidDataResponse>(`${RAIDER_IO_RAID_STATIC_URL}?expansion_id=${expansionId}`),
      fetchJsonOrNull<StaticMythicPlusDataResponse>(
        `${RAIDER_IO_MPLUS_STATIC_URL}?expansion_id=${expansionId}`
      ),
    ]);

    for (const raid of raidData?.raids ?? []) {
      if (!raid.slug || !raid.name) continue;
      if (!isRaidWithMajorSize(raid.encounters)) continue;

      raidCandidates.push({
        slug: raid.slug,
        label: raid.name,
        startsAt: parseDateByRegion(raid.starts, region),
      });
    }

    for (const season of mplusData?.seasons ?? []) {
      if (!season.slug || !season.name) continue;
      if (season.is_main_season === false) continue;
      if (!isCanonicalMainSeasonSlug(season.slug)) continue;

      mplusCandidates.push({
        slug: season.slug,
        label: season.name,
        startsAt: parseDateByRegion(season.starts, region),
      });
    }
  }

  const raidTiers = dedupeBySlug(raidCandidates)
    .sort((a, b) => b.startsAt - a.startsAt)
    .slice(0, 4)
    .map((entry) => ({ slug: entry.slug, label: entry.label }));

  const mythicPlusSeasons = dedupeBySlug(mplusCandidates)
    .sort((a, b) => b.startsAt - a.startsAt)
    .slice(0, 4)
    .map((entry) => ({ slug: entry.slug, label: entry.label }));

  const selection: ProgressionSelection = {
    raidTiers,
    mythicPlusSeasons,
  };

  progressionSelectionCache.set(region, {
    value: selection,
    expiresAt: Date.now() + STATIC_CACHE_TTL_MS,
  });

  return selection;
}

function buildProfileFields(selection: ProgressionSelection): string {
  const fields: string[] = [];

  if (selection.raidTiers.length > 0) {
    fields.push(`raid_progression:${selection.raidTiers.map((tier) => tier.slug).join(":")}`);
  } else {
    fields.push("raid_progression:previous-tier");
  }

  if (selection.mythicPlusSeasons.length > 0) {
    fields.push(
      `mythic_plus_scores_by_season:${selection.mythicPlusSeasons.map((season) => season.slug).join(":")}`
    );
  } else {
    fields.push("mythic_plus_scores_by_season:current:previous");
  }

  return fields.join(",");
}

export function mapRaiderIoResponse(
  input: RaiderIoRequest,
  response: RaiderIoProfileResponse,
  selection: ProgressionSelection
): CharacterSummary {
  const raidTiers: RaidTierSummary[] = selection.raidTiers.map((tier) => {
    const raid = response.raid_progression?.[tier.slug];
    const totalBosses =
      typeof raid?.total_bosses === "number" && Number.isFinite(raid.total_bosses)
        ? raid.total_bosses
        : null;
    const normalKills = raid?.normal_bosses_killed;
    const heroicKills = raid?.heroic_bosses_killed;
    const mythicKills = raid?.mythic_bosses_killed;
    const kills = [normalKills, heroicKills, mythicKills];
    const hasPositiveKill = kills.some((value) => typeof value === "number" && value > 0);
    const hasExperience = totalBosses !== null && hasPositiveKill;

    return {
      slug: tier.slug,
      label: tier.label,
      normal: formatKillString(normalKills, totalBosses),
      heroic: formatKillString(heroicKills, totalBosses),
      mythic: formatKillString(mythicKills, totalBosses),
      totalBosses,
      hasExperience,
    };
  });

  const scores = response.mythic_plus_scores_by_season ?? [];
  const mythicPlusSeasons: MythicPlusSeasonSummary[] = selection.mythicPlusSeasons.map(
    (season, index) => {
      const score = scores[index]?.scores?.all;
      return {
        slug: season.slug,
        label: season.label,
        score: typeof score === "number" && score > 0 ? score : null,
      };
    }
  );

  return {
    name: response.name ?? input.name,
    region: (response.region ?? input.region).toLowerCase(),
    realm: response.realm ?? input.realm,
    profileUrl:
      response.profile_url ??
      `https://raider.io/characters/${encodeURIComponent(input.region)}/${encodeURIComponent(
        input.realm
      )}/${encodeURIComponent(input.name)}`,
    thumbnailUrl: response.thumbnail_url,
    raidTiers,
    mythicPlusSeasons,
  };
}

export async function fetchCharacterSummary(
  input: RaiderIoRequest,
  accessKey?: string
): Promise<CharacterSummary> {
  const selection = await loadProgressionSelection(input.region);
  const params = new URLSearchParams({
    region: input.region.toLowerCase(),
    realm: input.realm,
    name: input.name,
    fields: buildProfileFields(selection),
  });

  if (accessKey) {
    params.set("access_key", accessKey);
  }

  const url = `${RAIDER_IO_PROFILE_URL}?${params.toString()}`;
  const response = await fetch(url, {
    headers: {
      "User-Agent": "zbot2/0.1.0",
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Raider.IO request failed (${response.status}): ${text.slice(0, 200)}`);
  }

  const json = (await response.json()) as RaiderIoProfileResponse;
  return mapRaiderIoResponse(input, json, selection);
}
