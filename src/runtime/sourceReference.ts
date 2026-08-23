import type { SourceReference } from "../types";

const externalScheme = /^(?:https?|mailto|tel|weixin):/i;
const sourceExtension = /\.(?:[cm]?[jt]sx?|swift|go|rs|py|rb|java|kt|kts|c|cc|cpp|cxx|h|hh|hpp|cs|php|scala|sh|zsh|fish|sql|vue|svelte|css|scss|sass|less|html?|xml|ya?ml|json|toml|ini|md|gradle|properties)$/i;
const sourceFilename = /^(?:Dockerfile|Makefile|Rakefile|Gemfile|Podfile)$/i;

export function parseSourceReference(href?: string): SourceReference | null {
  if (!href || externalScheme.test(href)) return null;
  let value = safeDecode(href.trim());
  if (value.startsWith("file://")) value = value.slice("file://".length);

  let line = 0;
  let hasExplicitLine = false;
  const hashMatch = value.match(/#L(\d+)(?:-L?\d+)?$/i);
  if (hashMatch) {
    hasExplicitLine = true;
    line = Number(hashMatch[1]);
    value = value.slice(0, hashMatch.index);
  } else {
    const suffixMatch = value.match(/:(\d+)(?::\d+)?$/);
    if (suffixMatch) {
      hasExplicitLine = true;
      line = Number(suffixMatch[1]);
      value = value.slice(0, suffixMatch.index);
    }
  }

  if (/^[a-z][a-z0-9+.-]*:/i.test(value)) return null;

  value = value.replace(/^\.\//, "");
  const basename = value.split("/").at(-1) ?? "";
  if (!value || (!sourceExtension.test(value) && !sourceFilename.test(basename)) || (!value.includes("/") && !hasExplicitLine)) return null;
  return { path: value, line: Number.isSafeInteger(line) && line > 0 ? line : 1 };
}

export function sourceViewerHref(projectId: string, reference: SourceReference, search = ""): string {
  const query = new URLSearchParams({ project: projectId, path: reference.path, line: String(reference.line) });
  const pageQuery = search.startsWith("?") ? search : search ? `?${search}` : "";
  return `/${pageQuery}#/code?${query.toString()}`;
}

export function sourceReferenceFromLocation(location: Pick<Location, "hash">): (SourceReference & { projectId: string }) | null {
  const match = location.hash.match(/^#\/code(?:\?(.*))?$/);
  if (!match) return null;
  const query = new URLSearchParams(match[1] ?? "");
  const projectId = query.get("project")?.trim() ?? "";
  const path = query.get("path")?.trim() ?? "";
  const line = Number(query.get("line") ?? "1");
  if (!projectId || !path || !Number.isSafeInteger(line) || line < 1) return null;
  return { projectId, path, line };
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
