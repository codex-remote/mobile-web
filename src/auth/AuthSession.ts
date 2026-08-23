export type AuthStatus = "checking" | "pairing" | "authenticated" | "unauthenticated" | "unavailable";

export type AuthState = {
  status: AuthStatus;
  clientName?: string;
  message?: string;
};

type AuthEnvelope = {
  success: boolean;
  data?: {
    access_token: string;
    client: { name: string };
  };
  error?: { code: string; message?: string };
};

export interface AccessTokenProvider {
  getAccessToken(): string;
  refresh(rejectedToken?: string): Promise<string>;
}

type AutoPairingCodeProvider = () => Promise<string>;

export class AuthSession implements AccessTokenProvider {
  private accessToken = "";
  private state: AuthState = { status: "checking" };
  private refreshRequest: Promise<string> | null = null;
  private bootstrapRequest: Promise<void> | null = null;
  private pairingQueue: Promise<void> = Promise.resolve();
  private readonly handledPairingCodes = new Set<string>();
  private readonly listeners = new Set<(state: AuthState) => void>();

  constructor(private readonly baseUrl = "", private readonly autoPairingCode?: AutoPairingCodeProvider) {}

  snapshot = (): AuthState => this.state;

  subscribe = (listener: (state: AuthState) => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getAccessToken(): string {
    return this.accessToken;
  }

  bootstrap(): Promise<void> {
    if (this.bootstrapRequest) return this.bootstrapRequest;
    this.bootstrapRequest = this.bootstrapOnce();
    return this.bootstrapRequest;
  }

  handleLocationChange(): Promise<void> {
    const code = pairingCodeFromLocation(window.location);
    if (!code) return Promise.resolve();

    window.history.replaceState(window.history.state, "", `${window.location.pathname}${window.location.search}`);
    if (this.handledPairingCodes.has(code)) return this.pairingQueue;

    this.handledPairingCodes.add(code);
    const pairingRequest = this.pairingQueue.then(() => this.exchangePairingCode(code));
    this.pairingQueue = pairingRequest.catch(() => undefined);
    return pairingRequest;
  }

  refresh(rejectedToken?: string): Promise<string> {
    if (rejectedToken && this.accessToken && rejectedToken !== this.accessToken) {
      return Promise.resolve(this.accessToken);
    }
    if (this.refreshRequest) return this.refreshRequest;
    this.refreshRequest = this.withRefreshLock(() => this.requestToken("/v1/auth/tokens:refresh", {}))
      .then((payload) => {
        this.acceptToken(payload);
        return this.accessToken;
      })
      .catch((error) => {
        this.accessToken = "";
        this.update(error instanceof AuthError && error.status === 401
          ? { status: "unauthenticated", message: "此设备的访问凭证已失效。" }
          : { status: "unavailable", message: "暂时无法连接认证服务。" });
        throw error;
      })
      .finally(() => {
        this.refreshRequest = null;
      });
    return this.refreshRequest;
  }

  async retry(): Promise<void> {
    this.update({ status: "checking" });
    await this.restoreOrAutoPair();
  }

  async logout(): Promise<void> {
    try {
      await fetch(`${this.baseUrl}/v1/auth/sessions/current:revoke`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", "X-CodexRemote-Request": "1" },
        body: "{}",
      });
    } finally {
      this.accessToken = "";
      this.update({ status: "unauthenticated", message: "此设备已退出。" });
    }
  }

  private async bootstrapOnce(): Promise<void> {
    if (pairingCodeFromLocation(window.location)) {
      await this.handleLocationChange();
      return;
    }
    await this.restoreOrAutoPair();
  }

  private async restoreOrAutoPair(): Promise<void> {
    try {
      await this.refresh();
      return;
    } catch {
      // Local Codex debug mode may recover through its loopback-only pairing provider.
    }
    if (!this.autoPairingCode) return;
    try {
      const code = await this.autoPairingCode();
      this.handledPairingCodes.add(code);
      await this.exchangePairingCode(code);
    } catch {
      this.accessToken = "";
      this.update({ status: "unavailable", message: "暂时无法完成本机调试鉴权。" });
    }
  }

  private async exchangePairingCode(code: string): Promise<void> {
    this.update({ status: "pairing" });
    try {
      this.acceptToken(await this.requestToken("/v1/auth/pairing-grants:exchange", { code }));
    } catch (error) {
      this.handledPairingCodes.delete(code);
      this.accessToken = "";
      this.update(error instanceof AuthError && error.status < 500
        ? { status: "unauthenticated", message: pairingErrorMessage(error.code) }
        : { status: "unavailable", message: "暂时无法完成设备配对。" });
    }
  }

  private async requestToken(path: string, body: unknown): Promise<AuthEnvelope["data"] & {}> {
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}${path}`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", "X-CodexRemote-Request": "1" },
        body: JSON.stringify(body),
      });
    } catch {
      throw new AuthError("AUTH_NETWORK", 503);
    }
    let payload: AuthEnvelope;
    try {
      payload = await response.json() as AuthEnvelope;
    } catch {
      throw new AuthError(`HTTP_${response.status}`, response.status);
    }
    if (!response.ok || !payload.success || !payload.data?.access_token) {
      throw new AuthError(payload.error?.code ?? `HTTP_${response.status}`, response.status);
    }
    return payload.data;
  }

  private withRefreshLock<T>(operation: () => Promise<T>): Promise<T> {
    const lockManager = (globalThis.navigator as Navigator & { locks?: LockManager } | undefined)?.locks;
    if (!lockManager) return operation();
    return lockManager.request("codexremote-runtime-refresh", operation);
  }

  private acceptToken(payload: AuthEnvelope["data"] & {}): void {
    this.accessToken = payload.access_token;
    this.update({ status: "authenticated", clientName: payload.client.name });
  }

  private update(state: AuthState): void {
    this.state = state;
    for (const listener of this.listeners) listener(state);
  }
}

export class AuthError extends Error {
  constructor(readonly code: string, readonly status: number) {
    super(code);
  }
}

export function pairingCodeFromLocation(location: Pick<Location, "hash" | "pathname">): string {
  if (location.pathname !== "/pair" || !location.hash.startsWith("#")) return "";
  return new URLSearchParams(location.hash.slice(1)).get("code")?.trim() ?? "";
}

function pairingErrorMessage(code: string): string {
  if (code === "AUTH_PAIRING_ALREADY_USED") return "这个配对链接已经使用过。";
  if (code === "AUTH_CREDENTIAL_EXPIRED") return "这个配对链接已经过期。";
  return "这个配对链接无效。";
}

async function requestDevAutoPairingCode(): Promise<string> {
  const response = await fetch("/__codexremote__/auth/auto-pair", {
    method: "POST",
    credentials: "same-origin",
    headers: { "X-CodexRemote-Debug": "1" },
  });
  const payload = await response.json() as { success?: boolean; data?: { code?: string } };
  const code = payload.data?.code?.trim();
  if (!response.ok || !payload.success || !code) throw new AuthError("DEV_AUTO_AUTH_FAILED", response.status);
  return code;
}

const autoPairingCode = import.meta.env.VITE_CODEXREMOTE_AUTO_AUTH === "1" ? requestDevAutoPairingCode : undefined;

export const authSession = new AuthSession("", autoPairingCode);
