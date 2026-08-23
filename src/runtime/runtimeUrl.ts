type PageLocation = Pick<Location, "origin">;

export function resolveRuntimeUrl(location?: PageLocation): string {
  return location?.origin || "http://127.0.0.1:18774";
}
