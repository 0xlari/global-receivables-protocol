import { describe, expect, it, vi } from "vitest";

const redirect = vi.fn(() => {
  throw new Error("NEXT_REDIRECT:/markets");
});

vi.mock("next/navigation", () => ({ redirect }));

import ReceivablePage from "./page";

describe("legacy receivable route", () => {
  it("redirects generic receivable creation to the GRP Markets directory", () => {
    expect(() => ReceivablePage()).toThrow("NEXT_REDIRECT:/markets");
    expect(redirect).toHaveBeenCalledWith("/markets");
  });
});
