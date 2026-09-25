import { describe, expect, it } from "vitest";
import { storageRefusal } from "./policy";

const ask = (over: Partial<Parameters<typeof storageRefusal>[0]> = {}) =>
  storageRefusal({
    driver: "local",
    nodeEnv: "production",
    sharedVolume: false,
    ...over,
  });

describe("storageRefusal", () => {
  it("allows local storage in development without ceremony", () => {
    expect(ask({ nodeEnv: "development" })).toBeNull();
    expect(ask({ nodeEnv: "test" })).toBeNull();
  });

  it("refuses local storage in production by default", () => {
    // The default has to be the safe one: someone deploying without reading this
    // should get an error at startup, not missing uploads discovered by a judge.
    expect(ask()).toContain("STORAGE_LOCAL_SHARED_VOLUME=true");
  });

  it("allows it once the shared directory has been asserted", () => {
    expect(ask({ sharedVolume: true })).toBeNull();
  });

  it("says what to do instead, not merely what is wrong", () => {
    const message = ask()!;
    expect(message).toMatch(/s3|azure/i);
    expect(message).toMatch(/single VM|same directory/i);
  });

  it("never stands in the way of a real object store", () => {
    for (const driver of ["s3", "azure"] as const) {
      for (const sharedVolume of [true, false]) {
        expect(ask({ driver, sharedVolume })).toBeNull();
      }
    }
  });

  it("ignores the assertion for drivers it does not describe", () => {
    // STORAGE_LOCAL_SHARED_VOLUME left true from an earlier deployment must not
    // change anything about an S3 one.
    expect(ask({ driver: "s3", sharedVolume: true })).toBeNull();
  });
});
