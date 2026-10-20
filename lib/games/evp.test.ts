import { describe, expect, it } from "vitest";
import { EVP_PLAYBACK_RATE, EVP_SECONDS, evpSeconds, micErrorMessage, reverseChannels } from "./evp";

describe("EVP helpers", () => {
  it("records 15 seconds and plays back slowed", () => {
    expect(EVP_SECONDS).toBe(15);
    expect(evpSeconds(null)).toBe(15);
    expect(evpSeconds("short")).toBeLessThan(15);
    expect(EVP_PLAYBACK_RATE).toBeCloseTo(0.7);
  });

  it("reverses every channel without touching the input", () => {
    const left = new Float32Array([1, 2, 3, 4]);
    const right = new Float32Array([-1, -2, -3, -4]);
    const [l, r] = reverseChannels([left, right]);
    expect([...l]).toEqual([4, 3, 2, 1]);
    expect([...r]).toEqual([-4, -3, -2, -1]);
    expect([...left]).toEqual([1, 2, 3, 4]);
  });

  it("explains microphone failures", () => {
    expect(micErrorMessage({ name: "NotAllowedError" })).toContain("blocked");
    expect(micErrorMessage({ name: "NotFoundError" })).toContain("No microphone");
    expect(micErrorMessage(null)).toContain("Try again");
  });
});
