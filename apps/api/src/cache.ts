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
  rateLimit: (args: { bucket: string; key: string; limit: number; windowSec: number }) => Promise<{
    allowed: boolean;
    count: number;
    remaining: number;
    resetSec: number;
  }>;
  recordSuspicious: (args: { ip: string; bucket: string; kind: string }) => Promise<void>;
  checkAndAutoBan: (args: {
    ip: string;
    onBan: (ip: string, reason: string) => void;
  }) => Promise<boolean>;
  listSuspiciousIps: (args: { limit: number }) => Promise<
    {
      ip: string;
      score: number;
      lastSeen: string;
      counts: Record<string, number>;
    }[]
  >;
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
    rateLimit: async (args) => ({ allowed: true, count: 0, remaining: args.limit, resetSec: args.windowSec }),
    recordSuspicious: async () => {},
    checkAndAutoBan: async () => false,
    listSuspiciousIps: async () => [],
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
    const hit = await getJSON<any>(k);
    if (hit !== null) {
      if (hit && typeof hit === "object" && hit.__wrap === 1 && "value" in hit) return hit.value as T;
      return hit as T;
    }
    const value = await compute();
    await setJSON(k, { __wrap: 1, value }, ttlSec);
    return value;
  };

  const rateLimit = async (args: { bucket: string; key: string; limit: number; windowSec: number }) => {
    const k = `${prefix}rl:${args.bucket}:${args.key}`;
    try {
      const n = await client.incr(k);
      if (n === 1) await client.expire(k, args.windowSec);
      const ttl = await client.ttl(k);
      const resetSec = ttl > 0 ? ttl : args.windowSec;
      const remaining = Math.max(0, args.limit - n);
      return { allowed: n <= args.limit, count: n, remaining, resetSec };
    } catch {
      return { allowed: true, count: 0, remaining: args.limit, resetSec: args.windowSec };
    }
  };

  const recordSuspicious = async (args: { ip: string; bucket: string; kind: string }) => {
    const ip = args.ip || "unknown";
    const now = Date.now();
    const z = `${prefix}abuse:z`;
    const h = `${prefix}abuse:h:${ip}`;
    try {
      await client
        .multi()
        .zIncrBy(z, 1, ip)
        .hSet(h, { lastSeen: String(now) })
        .hIncrBy(h, `b:${args.bucket}`, 1)
        .hIncrBy(h, `k:${args.kind}`, 1)
        .expire(h, 60 * 60 * 24 * 30)
        .exec();

      const card = await client.zCard(z);
      if (card > 5000) {
        await client.zRemRangeByRank(z, 0, card - 5001);
      }

      // Progressive punishment: when blocked (not served from cache), inflate the
      // global per-IP rate-limit counter so repeat offenders hit limits faster.
      if (args.kind.endsWith("block")) {
        const gk = `${prefix}rl:global:${ip}`;
        await client.incrBy(gk, 5).catch(() => {});
      }
    } catch {
      // ignore
    }
  };

  const checkAndAutoBan = async (args: {
    ip: string;
    onBan: (ip: string, reason: string) => void;
  }): Promise<boolean> => {
    const ip = args.ip || "unknown";
    const z = `${prefix}abuse:z`;
    try {
      const score = await client.zScore(z, ip);
      if (score !== null && score >= 50) {
        const reason = `auto: score=${score}`;
        args.onBan(ip, reason);
        // Remove from abuse set after banning to avoid repeated callbacks.
        await client.zRem(z, ip).catch(() => {});
        return true;
      }
    } catch {
      // ignore
    }
    return false;
  };

  const listSuspiciousIps = async (args: { limit: number }) => {
    const limit = Math.min(1000, Math.max(1, args.limit || 200));
    const z = `${prefix}abuse:z`;
    const pairs = await client.zRangeWithScores(z, 0, limit - 1, { REV: true }).catch(() => []);
    const items: {
      ip: string;
      score: number;
      lastSeen: string;
      counts: Record<string, number>;
    }[] = [];

    for (const p of pairs as any[]) {
      const ip = String(p.value ?? "");
      const score = Number(p.score ?? 0) || 0;
      const h = `${prefix}abuse:h:${ip}`;
      const fields = await client.hGetAll(h).catch(() => ({} as Record<string, string>));
      const lastSeenMs = Number(fields.lastSeen ?? "0") || 0;
      const lastSeen = lastSeenMs ? new Date(lastSeenMs).toISOString() : "";
      const counts: Record<string, number> = {};
      for (const [k, v] of Object.entries(fields)) {
        if (k === "lastSeen") continue;
        const n = Number(v) || 0;
        if (n) counts[k] = n;
      }
      items.push({ ip, score, lastSeen, counts });
    }
    return items;
  };

  return { enabled: true, getVersion, bump, getJSON, setJSON, key, wrapJSON, rateLimit, recordSuspicious, checkAndAutoBan, listSuspiciousIps };
};
