import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ButtonLink } from "@/components/button-link";

describe("ButtonLink", () => {
  it("renders an accessible link with its destination", () => {
    render(<ButtonLink href="/como-funciona">Conhecer</ButtonLink>);

    expect(screen.getByRole("link", { name: "Conhecer" })).toHaveAttribute(
      "href",
      "/como-funciona",
    );
  });
});
