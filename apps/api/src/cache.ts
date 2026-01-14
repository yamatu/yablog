import crypto from "node:crypto";

import { createClient, type RedisClientType } from "redis";

import { config } from "./config.js";

export type Cache = {
  enabled: boolean;
  getVersion: (ns: string) => Promise<number>;
  bump: (ns: string) => Promise<number>;
  getJSON: <T>(key: string) => Promise<T | null>;
  setJSON: (key: string, value: unknown, ttlSec: number) => Promise<void>;
  key: (ns: string, raw: unknown) => Promise<string>;
  wrapJSON: <T>(ns: string, raw: unknown, ttlSec: number, compute: () => Promise<T> | T) => Promise<T>;
};

const prefix = "yablog:cache:";

const sha1 = (input: string) => crypto.createHash("sha1").update(input).digest("hex").slice(0, 16);

const safeJsonStringify = (value: unknown) => {
  try {
    return JSON.stringify(value);
  } catch {
    return null;
  }
};

const safeJsonParse = <T>(value: string): T | null => {
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
};

export const createCache = async (): Promise<Cache> => {
  const url = config.redisUrl;
  const noop: Cache = {
    enabled: false,
    getVersion: async () => 1,
    bump: async () => 1,
    getJSON: async () => null,
    setJSON: async () => {},
    key: async (_ns, raw) => `${prefix}noop:${sha1(safeJsonStringify(raw) ?? String(raw))}`,
    wrapJSON: async (_ns, _raw, _ttl, compute) => Promise.resolve(compute()),
  };
  if (!url) return noop;

  const client: RedisClientType = createClient({ url });
  client.on("error", (err) => {
    // eslint-disable-next-line no-console
    console.warn("[yablog-cache] redis error", err?.message ?? err);
  });

  try {
    await client.connect();
    // eslint-disable-next-line no-console
    console.log("[yablog-cache] redis connected");
  } catch (e: any) {
    // eslint-disable-next-line no-console
    console.warn("[yablog-cache] redis connect failed; caching disabled", e?.message ?? e);
    return noop;
  }

  const getVersion = async (ns: string) => {
    const k = `${prefix}v:${ns}`;
    const v = await client.get(k);
    if (v) return Number.parseInt(v, 10) || 1;
    await client.set(k, "1");
    return 1;
  };

  const bump = async (ns: string) => {
    const k = `${prefix}v:${ns}`;
    const n = await client.incr(k);
    return n || 1;
  };

  const key = async (ns: string, raw: unknown) => {
    const v = await getVersion(ns);
    const payload = safeJsonStringify(raw) ?? String(raw);
    return `${prefix}${ns}:v${v}:${sha1(payload)}`;
  };

  const getJSON = async <T,>(k: string): Promise<T | null> => {
    try {
      const v = await client.get(k);
      if (!v) return null;
      return safeJsonParse<T>(v);
    } catch {
      return null;
    }
  };

  const setJSON = async (k: string, value: unknown, ttlSec: number) => {
    const v = safeJsonStringify(value);
    if (!v) return;
    try {
      await client.set(k, v, { EX: ttlSec });
    } catch {
      // ignore
    }
  };

  const wrapJSON = async <T,>(ns: string, raw: unknown, ttlSec: number, compute: () => Promise<T> | T) => {
    const k = await key(ns, raw);
    const hit = await getJSON<T>(k);
    if (hit !== null) return hit;
    const value = await compute();
    await setJSON(k, value, ttlSec);
    return value;
  };

  return { enabled: true, getVersion, bump, getJSON, setJSON, key, wrapJSON };
};
