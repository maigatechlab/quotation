import { beforeEach, describe, expect, it } from "vitest";
import { generateTempNumber, formatServerNumber, getNextLocalSeq, getDeviceId } from "./numbering";

describe("generateTempNumber", () => {
  it("formats correctly with 4-char device prefix and 4-digit seq", () => {
    expect(generateTempNumber("ABC1", 1)).toBe("TEMP-ABC1-0001");
  });

  it("pads sequence to 4 digits", () => {
    expect(generateTempNumber("XY12", 42)).toBe("TEMP-XY12-0042");
  });

  it("uppercases device prefix", () => {
    expect(generateTempNumber("abc1", 1)).toBe("TEMP-ABC1-0001");
  });

  it("truncates device id to 4 chars", () => {
    expect(generateTempNumber("ABCDEF", 1)).toBe("TEMP-ABCD-0001");
  });
});

describe("formatServerNumber", () => {
  it("formats year and seq correctly", () => {
    expect(formatServerNumber(2026, 42)).toBe("DEV-2026-0042");
  });

  it("pads sequence to 4 digits", () => {
    expect(formatServerNumber(2026, 1)).toBe("DEV-2026-0001");
  });

  it("handles large seq", () => {
    expect(formatServerNumber(2026, 9999)).toBe("DEV-2026-9999");
  });
});

describe("getNextLocalSeq", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("starts at 1 for new device", () => {
    expect(getNextLocalSeq("DEV1")).toBe(1);
  });

  it("increments on each call", () => {
    expect(getNextLocalSeq("DEV2")).toBe(1);
    expect(getNextLocalSeq("DEV2")).toBe(2);
    expect(getNextLocalSeq("DEV2")).toBe(3);
  });

  it("tracks sequences independently per device", () => {
    expect(getNextLocalSeq("AAAA")).toBe(1);
    expect(getNextLocalSeq("BBBB")).toBe(1);
    expect(getNextLocalSeq("AAAA")).toBe(2);
  });
});

describe("getDeviceId", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("generates a device id on first call", () => {
    const id = getDeviceId();
    expect(typeof id).toBe("string");
    expect(id.length).toBeGreaterThan(0);
  });

  it("returns the same id on subsequent calls", () => {
    const id1 = getDeviceId();
    const id2 = getDeviceId();
    expect(id1).toBe(id2);
  });
});
