type PageLocation = Pick<Location, "hostname" | "protocol">;

export function resolveRuntimeUrl(explicitUrl: string | undefined, location?: PageLocation): string {
  const configured = explicitUrl?.trim();
  if (configured) return configured.replace(/\/+$/, "");

  const hostname = location?.hostname || "127.0.0.1";
  const formattedHostname = hostname.includes(":") ? `[${hostname}]` : hostname;
  const protocol = location?.protocol === "https:" ? "https:" : "http:";
  return `${protocol}//${formattedHostname}:18775`;
}
