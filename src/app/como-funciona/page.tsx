import type { Metadata } from "next";
import { GrpProtocolExperience } from "@/components/grp-protocol-experience";

export const metadata: Metadata = {
  title: "Protocol",
  description:
    "Interactive walkthrough of the Global Receivables Protocol lifecycle on Solana.",
};

export default function ProtocolPage() {
  return <GrpProtocolExperience />;
}
