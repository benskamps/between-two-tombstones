import { afterEach, describe, expect, it, vi } from "vitest";
import { forgetNext, readNext, rememberNext } from "./next";

class MemoryStorage {
  data = new Map<string, string>();
  getItem(k: string) {
    return this.data.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.data.set(k, v);
  }
  removeItem(k: string) {
    this.data.delete(k);
  }
}

afterEach(() => vi.unstubAllGlobals());

describe("the remembered tool (F12)", () => {
  it("round-trips a tool page for half an hour, then forgets", () => {
    vi.stubGlobal("sessionStorage", new MemoryStorage());
    const t = 1_000_000;
    rememberNext("/stamp", t);
    expect(readNext(t + 60_000)).toBe("/stamp");
    expect(readNext(t + 31 * 60_000)).toBeNull();
    forgetNext();
    expect(readNext(t)).toBeNull();
  });

  it("ignores anything that isn't one of our tools", () => {
    const s = new MemoryStorage();
    vi.stubGlobal("sessionStorage", s);
    rememberNext("https://evil.example/");
    expect(s.data.size).toBe(0);
    s.setItem("btt-next", JSON.stringify({ tool: "//evil.example", at: Date.now() }));
    expect(readNext()).toBeNull();
    s.setItem("btt-next", "{nope");
    expect(readNext()).toBeNull();
  });

  it("does nothing, and never throws, when storage is blocked", () => {
    vi.stubGlobal("sessionStorage", {
      getItem() {
        throw new DOMException("blocked", "SecurityError");
      },
      setItem() {
        throw new DOMException("blocked", "SecurityError");
      },
      removeItem() {
        throw new DOMException("blocked", "SecurityError");
      },
    });
    expect(() => rememberNext("/stamp")).not.toThrow();
    expect(readNext()).toBeNull();
    expect(() => forgetNext()).not.toThrow();
  });
});
