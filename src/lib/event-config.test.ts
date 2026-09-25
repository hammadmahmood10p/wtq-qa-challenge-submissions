import { describe, expect, it } from "vitest";
import { normaliseApplicationUrl } from "./event-config";

describe("normaliseApplicationUrl", () => {
  it("keeps a full https address", () => {
    expect(normaliseApplicationUrl("https://shop.example.com/")).toBe("https://shop.example.com/");
  });

  it("assumes https for a bare host, because someone will paste one", () => {
    expect(normaliseApplicationUrl("shop.example.com")).toBe("https://shop.example.com/");
  });

  it("keeps a path, a port and a query", () => {
    expect(normaliseApplicationUrl("http://192.168.1.13:3000/store?lang=en")).toBe(
      "http://192.168.1.13:3000/store?lang=en",
    );
  });

  it("allows localhost, for a rehearsal against a machine in the room", () => {
    expect(normaliseApplicationUrl("http://localhost:3000")).toBe("http://localhost:3000/");
  });

  it("trims surrounding whitespace from a paste", () => {
    expect(normaliseApplicationUrl("  https://shop.example.com  ")).toBe(
      "https://shop.example.com/",
    );
  });

  it("refuses anything that is not http or https", () => {
    // This value is rendered as an anchor on a page a thousand people open. An
    // administrator is trusted, but a trusted person can still paste the wrong thing.
    expect(normaliseApplicationUrl("javascript:alert(1)")).toBeNull();
    expect(normaliseApplicationUrl("data:text/html,<script>alert(1)</script>")).toBeNull();
    expect(normaliseApplicationUrl("file:///etc/passwd")).toBeNull();
  });

  it("refuses an empty or unusable value", () => {
    expect(normaliseApplicationUrl("")).toBeNull();
    expect(normaliseApplicationUrl("   ")).toBeNull();
    expect(normaliseApplicationUrl("not a url at all")).toBeNull();
  });

  it("refuses a bare word that is not a hostname", () => {
    // "shop" would otherwise become https://shop/ and fail only when a participant
    // clicks it.
    expect(normaliseApplicationUrl("shop")).toBeNull();
  });
});
