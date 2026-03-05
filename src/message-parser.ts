import type { RaiderIoLink } from "./url-parser.js";
import { extractRaiderIoLinks, stripRaiderIoLinksFromText } from "./url-parser.js";

export interface ParsedMessageInput {
  links: RaiderIoLink[];
  outboundText: string;
}

interface ParsedSource {
  links: RaiderIoLink[];
  cleanedText: string;
}

function linkKey(link: RaiderIoLink): string {
  return `${link.region.toLowerCase()}|${link.realm.toLowerCase()}|${link.name.toLowerCase()}`;
}

function dedupeLinks(links: RaiderIoLink[]): RaiderIoLink[] {
  const seen = new Set<string>();
  const deduped: RaiderIoLink[] = [];

  for (const link of links) {
    const key = linkKey(link);
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(link);
  }

  return deduped;
}

function parseSource(text: string): ParsedSource {
  const normalizedText = text.trim();
  const links = extractRaiderIoLinks(normalizedText);
  const cleanedText =
    links.length > 0 ? stripRaiderIoLinksFromText(normalizedText, links) : normalizedText;

  return {
    links,
    cleanedText,
  };
}

export function parseMessageInputFromSources(sources: string[]): ParsedMessageInput {
  const parsedSources = sources
    .map((source) => parseSource(source))
    .filter((source) => source.links.length > 0 || source.cleanedText.length > 0);

  const allLinks = dedupeLinks(parsedSources.flatMap((source) => source.links));
  const preferredTextSource = parsedSources.find(
    (source) => source.links.length > 0 && source.cleanedText.length > 0
  );
  const fallbackTextSource = parsedSources.find((source) => source.cleanedText.length > 0);

  return {
    links: allLinks,
    outboundText: preferredTextSource?.cleanedText ?? fallbackTextSource?.cleanedText ?? "",
  };
}
