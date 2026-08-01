import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { createHmac, randomUUID } from "crypto";
import { verifyGuestToken, verifyAppSessionToken } from "./guest.js";

describe("guest session tokens", () => {
  const prevSecret = process.env.SESSION_SECRET;
  const prevNodeEnv = process.env.NODE_ENV;

  beforeEach(() => {
    process.env.SESSION_SECRET = "test-session-secret";
    process.env.NODE_ENV = "test";
  });

  afterEach(() => {
    if (prevSecret === undefined) delete process.env.SESSION_SECRET;
    else process.env.SESSION_SECRET = prevSecret;
    if (prevNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = prevNodeEnv;
  });

  it("verifies guest tokens with expiry", () => {
    const id = randomUUID();
    const exp = Math.floor(Date.now() / 1000) + 3600;
    const payload = `${id}.${exp}`;
    const sig = createHmac("sha256", "test-session-secret").update(payload).digest("hex");
    const token = `${payload}.${sig}`;

    expect(verifyGuestToken(token)).toBe(`guest_${id}`);
    expect(verifyAppSessionToken(token)).toBeNull();
  });

  it("rejects expired guest tokens", () => {
    const id = "11111111-1111-1111-1111-111111111111";
    const exp = Math.floor(Date.now() / 1000) - 10;
    const payload = `${id}.${exp}`;
    const sig = createHmac("sha256", "test-session-secret").update(payload).digest("hex");
    expect(verifyGuestToken(`${payload}.${sig}`)).toBeNull();
  });

  it("still accepts legacy id.hmac guest tokens", () => {
    const id = "22222222-2222-2222-2222-222222222222";
    const sig = createHmac("sha256", "test-session-secret").update(id).digest("hex");
    expect(verifyGuestToken(`${id}.${sig}`)).toBe(`guest_${id}`);
  });

  it("verifies clerk app session tokens", () => {
    const id = "user_abc123";
    const exp = Math.floor(Date.now() / 1000) + 3600;
    const payload = `${id}.${exp}`;
    const sig = createHmac("sha256", "test-session-secret").update(payload).digest("hex");
    const token = `${payload}.${sig}`;
    expect(verifyAppSessionToken(token)).toBe(id);
    expect(verifyGuestToken(token)).toBeNull();
  });
});
