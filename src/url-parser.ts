export interface RaiderIoLink {
  rawMatch: string;
  cleanedUrl: string;
  region: string;
  realm: string;
  name: string;
}

const TRAILING_PUNCTUATION = /[),.!?]+$/;
const RIO_LINK_REGEX = /https?:\/\/(?:www\.)?raider\.io\/characters\/[^\s]+/gi;

function cleanUrlMatch(url: string): string {
  let cleaned = url.trim();
  while (TRAILING_PUNCTUATION.test(cleaned)) {
    cleaned = cleaned.slice(0, -1);
  }
  return cleaned;
}

function parseCharacterPath(url: URL): RaiderIoLink | null {
  const parts = url.pathname.split("/").filter(Boolean);
  if (parts.length < 4 || parts[0] !== "characters") {
    return null;
  }

  return {
    rawMatch: "",
    cleanedUrl: url.toString(),
    region: decodeURIComponent(parts[1]).toLowerCase(),
    realm: decodeURIComponent(parts[2]),
    name: decodeURIComponent(parts[3]),
  };
}

export function extractRaiderIoLinks(text: string): RaiderIoLink[] {
  const links: RaiderIoLink[] = [];
  const matches = text.match(RIO_LINK_REGEX) ?? [];

  for (const rawMatch of matches) {
    const cleanedUrl = cleanUrlMatch(rawMatch);
    try {
      const parsed = new URL(cleanedUrl);
      const parsedLink = parseCharacterPath(parsed);
      if (!parsedLink) {
        continue;
      }
      links.push({
        ...parsedLink,
        rawMatch,
        cleanedUrl,
      });
    } catch {
      continue;
    }
  }

  return links;
}

export function stripRaiderIoLinksFromText(text: string, links: RaiderIoLink[]): string {
  let output = text;
  for (const link of links) {
    output = output.replace(link.rawMatch, " ");
  }
  return output.replace(/\s+/g, " ").trim();
}
