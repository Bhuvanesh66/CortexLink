import type { AuthConfig } from "convex/server";

const isLocalMode = process.env.CORTEX_LOCAL_MODE === "1";
// Only read the issuer outside local mode: Convex requires every env var the
// auth config touches to be set, which would block local-mode pushes.
const clerkIssuer = isLocalMode ? undefined : process.env.CLERK_JWT_ISSUER_DOMAIN;

if (!isLocalMode && !clerkIssuer) {
  throw new Error("CLERK_JWT_ISSUER_DOMAIN is required outside local mode");
}

export default {
  providers: !isLocalMode && clerkIssuer
    ? [
        {
          domain: clerkIssuer,
          applicationID: "convex",
        },
      ]
    : [],
} satisfies AuthConfig;
