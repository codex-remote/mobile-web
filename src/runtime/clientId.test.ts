import { describe, expect, it } from "vitest";
import { createClientId } from "./clientId";

describe("createClientId", () => {
  it("uses randomUUID when the secure-context API is available", () => {
    expect(createClientId({ randomUUID: () => "native-id" })).toBe("native-id");
  });

  it("creates a UUID with getRandomValues on insecure LAN origins", () => {
    const id = createClientId({
      getRandomValues(values) {
        values.set(Array.from({ length: 16 }, (_, index) => index));
        return values;
      },
    });
    expect(id).toBe("00010203-0405-4607-8809-0a0b0c0d0e0f");
  });
});
