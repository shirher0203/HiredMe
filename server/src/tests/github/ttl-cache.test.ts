import { TtlCache } from "../../utils/ttl-cache";

describe("TtlCache", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("returns a value before it expires", () => {
    const cache = new TtlCache<number>(1000);
    cache.set("a", 42);
    expect(cache.get("a")).toBe(42);
  });

  it("returns undefined after the TTL elapses", () => {
    const cache = new TtlCache<number>(1000);
    cache.set("a", 42);
    jest.advanceTimersByTime(1001);
    expect(cache.get("a")).toBeUndefined();
  });

  it("returns undefined for unknown keys and supports clear()", () => {
    const cache = new TtlCache<string>(1000);
    expect(cache.get("missing")).toBeUndefined();
    cache.set("x", "y");
    cache.clear();
    expect(cache.get("x")).toBeUndefined();
  });
});
