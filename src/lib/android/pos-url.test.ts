import { describe, expect, it } from "vitest";
import { parseAndroidPosUrl } from "./pos-url";

describe("parseAndroidPosUrl", () => {
  it("normalizes a private LAN HTTP origin", () => {
    expect(parseAndroidPosUrl("http://192.168.1.25:3000/")).toBe("http://192.168.1.25:3000");
  });

  it("accepts an HTTPS origin", () => {
    expect(parseAndroidPosUrl("https://pos.example.com")).toBe("https://pos.example.com");
  });

  it.each([undefined, "", "   "])("rejects a missing URL: %s", (value) => {
    expect(() => parseAndroidPosUrl(value)).toThrow(/ANDROID_POS_URL/i);
  });

  it.each(["ftp://192.168.1.25:3000", "file:///tmp/pos"])("rejects unsupported protocol %s", (value) => {
    expect(() => parseAndroidPosUrl(value)).toThrow(/http/i);
  });

  it.each([
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://127.8.9.10:3000",
    "http://[::1]:3000",
    "http://[0:0:0:0:0:0:0:1]:3000",
    "http://[::ffff:127.0.0.1]:3000",
    "http://localhost.:3000",
    "http://0.0.0.0:3000",
  ])("rejects non-device-reachable host %s", (value) => {
    expect(() => parseAndroidPosUrl(value)).toThrow(/host|reachable|localhost|loopback/i);
  });

  it("rejects embedded credentials", () => {
    expect(() => parseAndroidPosUrl("http://cashier:secret@192.168.1.25:3000")).toThrow(/credential|user|password/i);
  });

  it.each([
    "http://192.168.1.25:3000/pos",
    "http://192.168.1.25:3000/?mode=debug",
    "http://192.168.1.25:3000/#login",
  ])("rejects non-origin URL %s", (value) => {
    expect(() => parseAndroidPosUrl(value)).toThrow(/origin|path|query|fragment/i);
  });
});
