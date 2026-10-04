export const LRP_ORIGINATION_MODES = ["LEGACY", "SHADOW", "LRP"] as const;

export type LrpOriginationMode = (typeof LRP_ORIGINATION_MODES)[number];

export type LrpModePolicy = Readonly<{
  mode: LrpOriginationMode;
  canonicalPublicSource: "LEGACY" | "LRP";
  publishPublicEvents: boolean;
  projectPublicEvents: boolean;
  shadowValidateCandidates: boolean;
}>;

type Environment = Readonly<Record<string, string | undefined>>;

export function lrpOriginationModeFromEnvironment(
  environment: Environment = process.env,
): LrpOriginationMode {
  const raw = environment.LRP_ORIGINATION_MODE?.trim().toUpperCase();
  if (!raw) return "LEGACY";
  if ((LRP_ORIGINATION_MODES as readonly string[]).includes(raw)) {
    return raw as LrpOriginationMode;
  }
  throw new Error("LRP_ORIGINATION_MODE_INVALID");
}

export function lrpModePolicy(mode: LrpOriginationMode): LrpModePolicy {
  if (mode === "LEGACY") {
    return {
      mode,
      canonicalPublicSource: "LEGACY",
      publishPublicEvents: false,
      projectPublicEvents: false,
      shadowValidateCandidates: false,
    };
  }
  if (mode === "SHADOW") {
    return {
      mode,
      canonicalPublicSource: "LEGACY",
      publishPublicEvents: false,
      projectPublicEvents: false,
      shadowValidateCandidates: true,
    };
  }
  return {
    mode,
    canonicalPublicSource: "LRP",
    publishPublicEvents: true,
    projectPublicEvents: true,
    shadowValidateCandidates: false,
  };
}

export function currentLrpModePolicy(environment: Environment = process.env) {
  return lrpModePolicy(lrpOriginationModeFromEnvironment(environment));
}
