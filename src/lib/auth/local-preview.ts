import type { AuthenticatedUser } from "./guards";

export function isLocalPreviewEnabled(
  nodeEnv: string | undefined,
  setting: string | undefined,
): boolean {
  return nodeEnv !== "production" && setting === "true";
}

export function isLocalPreviewMode(): boolean {
  return isLocalPreviewEnabled(process.env.NODE_ENV, process.env.LOCAL_PREVIEW);
}

export const LOCAL_PREVIEW_USER: AuthenticatedUser = {
  id: "local-preview-user",
  name: "Pratinjau Lokal",
  email: "preview@localhost",
  role: "OWNER",
};
