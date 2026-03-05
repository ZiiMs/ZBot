const RAIDER_IO_PROFILE_URL = "https://raider.io/api/v1/characters/profile";
const PROFILE_FIELDS =
  "raid_progression:previous-tier,mythic_plus_scores_by_season:current:previous";

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
  raid: {
    normal: string;
    heroic: string;
    mythic: string;
    totalBosses: number | null;
    tierSlug: string | null;
  };
  mythicPlus: {
    current: number | null;
    previous: number | null;
  };
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

function formatKillString(kills: number | undefined, total: number | null): string {
  if (typeof kills !== "number" || !Number.isFinite(kills)) {
    return "N/A";
  }
  if (typeof total === "number" && Number.isFinite(total)) {
    return `${kills}/${total}`;
  }
  return `${kills}/N/A`;
}

export function mapRaiderIoResponse(
  input: RaiderIoRequest,
  response: RaiderIoProfileResponse
): CharacterSummary {
  const raidEntry = response.raid_progression
    ? Object.entries(response.raid_progression)[0]
    : undefined;
  const tierSlug = raidEntry?.[0] ?? null;
  const raid = raidEntry?.[1];
  const totalBosses =
    typeof raid?.total_bosses === "number" && Number.isFinite(raid.total_bosses)
      ? raid.total_bosses
      : null;

  const scores = response.mythic_plus_scores_by_season ?? [];
  const currentScore = scores[0]?.scores?.all;
  const previousScore = scores[1]?.scores?.all;

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
    raid: {
      normal: formatKillString(raid?.normal_bosses_killed, totalBosses),
      heroic: formatKillString(raid?.heroic_bosses_killed, totalBosses),
      mythic: formatKillString(raid?.mythic_bosses_killed, totalBosses),
      totalBosses,
      tierSlug,
    },
    mythicPlus: {
      current: typeof currentScore === "number" ? currentScore : null,
      previous: typeof previousScore === "number" ? previousScore : null,
    },
  };
}

export async function fetchCharacterSummary(
  input: RaiderIoRequest,
  accessKey?: string
): Promise<CharacterSummary> {
  const params = new URLSearchParams({
    region: input.region.toLowerCase(),
    realm: input.realm,
    name: input.name,
    fields: PROFILE_FIELDS,
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
  return mapRaiderIoResponse(input, json);
}
