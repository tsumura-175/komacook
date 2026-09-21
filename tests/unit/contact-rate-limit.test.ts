import { describe, expect, it } from "vitest";
import { contactRateLimitIdentifier, contactRequestIdentity } from "../../lib/contact-rate-limit";

describe("contact rate limit", () => {
  it("同じ識別子と秘密鍵から同じ不可逆ハッシュを作る", () => {
    const first = contactRateLimitIdentifier("guest:127.0.0.1", "test-secret");
    const second = contactRateLimitIdentifier("GUEST:127.0.0.1", "test-secret");
    expect(first).toMatch(/^[0-9a-f]{64}$/);
    expect(second).toBe(first);
    expect(first).not.toContain("127.0.0.1");
  });

  it("ログイン会員はIPより会員IDを優先する", () => {
    expect(contactRequestIdentity("user-id", "203.0.113.1", null)).toBe("user:user-id");
  });

  it("未ログインは転送元IPの先頭を利用する", () => {
    expect(contactRequestIdentity(undefined, "203.0.113.1, 10.0.0.1", null)).toBe("guest:203.0.113.1");
  });
});

