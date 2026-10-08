import { redirect } from "next/navigation";

export default function LegacyPoolDetailRoute() {
  redirect("/markets");
}
