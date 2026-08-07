import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { isOriginAllowed } from "./corsOrigins.js";

describe("isOriginAllowed", () => {
  const prev = {
    NODE_ENV: process.env.NODE_ENV,
    CORS_ORIGINS: process.env.CORS_ORIGINS,
    APP_ORIGIN: process.env.APP_ORIGIN,
    FRONTEND_ORIGIN: process.env.FRONTEND_ORIGIN,
    FRONTEND_DEV_URL: process.env.FRONTEND_DEV_URL,
  };

  beforeEach(() => {
    delete process.env.CORS_ORIGINS;
    delete process.env.APP_ORIGIN;
    delete process.env.FRONTEND_ORIGIN;
    delete process.env.FRONTEND_DEV_URL;
  });

  afterEach(() => {
    for (const [k, v] of Object.entries(prev)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  it("allows missing origin and localhost", () => {
    process.env.NODE_ENV = "production";
    expect(isOriginAllowed(undefined)).toBe(true);
    expect(isOriginAllowed("http://localhost:5173")).toBe(true);
  });

  it("allows Replit hosts in production", () => {
    process.env.NODE_ENV = "production";
    expect(isOriginAllowed("https://foo-bar.replit.dev")).toBe(true);
    expect(isOriginAllowed("https://app.replit.app")).toBe(true);
  });

  it("blocks unknown origins in production", () => {
    process.env.NODE_ENV = "production";
    expect(isOriginAllowed("https://evil.example.com")).toBe(false);
  });

  it("allows known Cinevault production hosts", () => {
    process.env.NODE_ENV = "production";
    expect(isOriginAllowed("https://cinevault.me")).toBe(true);
    expect(isOriginAllowed("https://www.mustwatch.it.com")).toBe(true);
  });

  it("allows configured CORS_ORIGINS", () => {
    process.env.NODE_ENV = "production";
    process.env.CORS_ORIGINS = "https://cinevault.example,https://other.example";
    expect(isOriginAllowed("https://cinevault.example")).toBe(true);
    expect(isOriginAllowed("https://nope.example")).toBe(false);
  });
});
