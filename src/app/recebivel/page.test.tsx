import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  redirect: vi.fn(),
}));

vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));

import ReceivablePage from "./page";

describe("legacy receivable route", () => {
  it("redirects generic receivable creation to the GRP Markets directory", () => {
    ReceivablePage();
    expect(mocks.redirect).toHaveBeenCalledWith("/markets");
  });
});
