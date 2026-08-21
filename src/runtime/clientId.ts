type RandomSource = {
  randomUUID?: () => string;
  getRandomValues?: (values: Uint8Array<ArrayBuffer>) => void;
};

export function createClientId(source: RandomSource | undefined = browserRandomSource()): string {
  if (typeof source?.randomUUID === "function") return source.randomUUID();

  const bytes = new Uint8Array(16);
  if (typeof source?.getRandomValues === "function") {
    source.getRandomValues(bytes);
  } else {
    const seed = `${Date.now().toString(16)}${Math.random().toString(16).slice(2)}`;
    for (let index = 0; index < bytes.length; index++) bytes[index] = seed.charCodeAt(index % seed.length) & 0xff;
  }
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function browserRandomSource(): RandomSource | undefined {
  if (typeof globalThis.crypto === "undefined") return undefined;
  const browserCrypto = globalThis.crypto;
  return {
    ...(typeof browserCrypto.randomUUID === "function" ? { randomUUID: () => browserCrypto.randomUUID() } : {}),
    getRandomValues: (values) => {
      browserCrypto.getRandomValues(values);
    },
  };
}
