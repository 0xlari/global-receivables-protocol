import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  redirect: vi.fn(),
}));

vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));

import PoolDetailsPage from "./page";

describe("legacy pool detail route", () => {
  it("redirects legacy pool details to the GRP Markets directory", () => {
    PoolDetailsPage();
    expect(mocks.redirect).toHaveBeenCalledWith("/markets");
  });
});
