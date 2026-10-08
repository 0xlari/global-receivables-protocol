import { describe, expect, it, vi } from "vitest";

const redirect = vi.fn(() => {
  throw new Error("NEXT_REDIRECT:/markets");
});

vi.mock("next/navigation", () => ({ redirect }));

import PoolDetailsPage from "./page";

describe("legacy pool detail route", () => {
  it("redirects legacy pool details to the GRP Markets directory", () => {
    expect(() => PoolDetailsPage()).toThrow("NEXT_REDIRECT:/markets");
    expect(redirect).toHaveBeenCalledWith("/markets");
  });
});
