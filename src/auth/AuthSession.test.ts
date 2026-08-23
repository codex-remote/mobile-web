import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthSession, pairingCodeFromLocation } from "./AuthSession";

describe("AuthSession", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("reads pairing credentials only from the /pair fragment", () => {
    expect(pairingCodeFromLocation({ pathname: "/pair", hash: "#code=secret%20code" })).toBe("secret code");
    expect(pairingCodeFromLocation({ pathname: "/", hash: "#code=secret" })).toBe("");
    expect(pairingCodeFromLocation({ pathname: "/pair", hash: "#other=value" })).toBe("");
  });

  it("deduplicates concurrent refreshes and keeps the access token in memory", async () => {
    const fetchMock = vi.fn(() => Promise.resolve(new Response(JSON.stringify({
      success: true,
      data: { access_token: "at_client.secret", client: { name: "My iPhone" } },
    }), { status: 200, headers: { "Content-Type": "application/json" } })));
    vi.stubGlobal("fetch", fetchMock);
    const session = new AuthSession("");

    const [first, second] = await Promise.all([session.refresh(), session.refresh()]);

    expect(first).toBe("at_client.secret");
    expect(second).toBe(first);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(session.getAccessToken()).toBe(first);
    expect(session.snapshot()).toMatchObject({ status: "authenticated", clientName: "My iPhone" });
  });

  it("clears the in-memory token when refresh is rejected", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(new Response(JSON.stringify({
      success: false,
      error: { code: "AUTH_SESSION_REVOKED" },
    }), { status: 401, headers: { "Content-Type": "application/json" } }))));
    const session = new AuthSession("");

    await expect(session.refresh()).rejects.toMatchObject({ code: "AUTH_SESSION_REVOKED" });
    expect(session.getAccessToken()).toBe("");
    expect(session.snapshot().status).toBe("unauthenticated");
  });

  it("uses the configured local debug pairing provider after refresh is rejected", async () => {
    vi.stubGlobal("window", {
      location: { pathname: "/", search: "", hash: "" },
      history: { state: null, replaceState: vi.fn() },
    });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        success: false,
        error: { code: "AUTH_REFRESH_REQUIRED" },
      }), { status: 401, headers: { "Content-Type": "application/json" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        success: true,
        data: { access_token: "at_debug.secret", client: { name: "Codex AI Debug" } },
      }), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    const autoPairingCode = vi.fn().mockResolvedValue("debug-pairing-code");
    const session = new AuthSession("", autoPairingCode);

    await session.bootstrap();

    expect(autoPairingCode).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1]?.[1]?.body).toBe(JSON.stringify({ code: "debug-pairing-code" }));
    expect(session.snapshot()).toMatchObject({ status: "authenticated", clientName: "Codex AI Debug" });
  });

  it("accepts a new pairing fragment after an earlier link was already used", async () => {
    const location = { pathname: "/pair", search: "", hash: "#code=used-code" };
    const replaceState = vi.fn();
    vi.stubGlobal("window", { location, history: { state: null, replaceState } });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        success: false,
        error: { code: "AUTH_PAIRING_ALREADY_USED" },
      }), { status: 409, headers: { "Content-Type": "application/json" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        success: true,
        data: { access_token: "at_client.fresh", client: { name: "My iPhone" } },
      }), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    const session = new AuthSession("");

    await session.bootstrap();
    expect(session.snapshot()).toMatchObject({ status: "unauthenticated", message: "这个配对链接已经使用过。" });

    location.hash = "#code=fresh-code";
    await session.handleLocationChange();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(session.getAccessToken()).toBe("at_client.fresh");
    expect(session.snapshot()).toMatchObject({ status: "authenticated", clientName: "My iPhone" });
    expect(replaceState).toHaveBeenLastCalledWith(null, "", "/pair");
  });

  it("exchanges the same pairing fragment only once while a request is in flight", async () => {
    const location = { pathname: "/pair", search: "", hash: "#code=one-time-code" };
    vi.stubGlobal("window", { location, history: { state: null, replaceState: vi.fn() } });
    let resolveFetch!: (response: Response) => void;
    const fetchMock = vi.fn(() => new Promise<Response>((resolve) => { resolveFetch = resolve; }));
    vi.stubGlobal("fetch", fetchMock);
    const session = new AuthSession("");

    const first = session.handleLocationChange();
    const second = session.handleLocationChange();
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    resolveFetch(new Response(JSON.stringify({
      success: true,
      data: { access_token: "at_client.once", client: { name: "Mobile Web" } },
    }), { status: 200, headers: { "Content-Type": "application/json" } }));

    await Promise.all([first, second]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(session.getAccessToken()).toBe("at_client.once");
  });
});
