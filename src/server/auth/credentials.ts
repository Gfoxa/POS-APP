import { z } from "zod";
import { isUserRole, type UserRole } from "../../lib/permissions/roles";
import { verifyPassword } from "./password";

const credentialsSchema = z.object({
  email: z.email().trim().toLowerCase().max(254),
  password: z.string().min(1).max(72).refine((value) => new TextEncoder().encode(value).length <= 72),
});

// Used for missing and inactive users so those accounts still incur a bcrypt comparison.
const DUMMY_PASSWORD_HASH = "$2b$12$Tr1QNFBwUWgUKik1qMHNEeLnFSkDOTALJVM26Y2BgDIql9B/SEr5i";

export type CredentialUser = {
  id: string;
  name: string;
  email: string;
  isActive: boolean;
  passwordHash: string;
  role: { name: string };
};

export type AuthenticatedIdentity = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
};

export async function authenticateCredentials(
  credentials: unknown,
  findUser: (email: string) => Promise<CredentialUser | null>,
): Promise<AuthenticatedIdentity | null> {
  const parsed = credentialsSchema.safeParse(credentials);
  if (!parsed.success) return null;

  const user = await findUser(parsed.data.email);
  const passwordMatches = await verifyPassword(
    parsed.data.password,
    user?.isActive ? user.passwordHash : DUMMY_PASSWORD_HASH,
  );

  if (!user?.isActive || !passwordMatches || !isUserRole(user.role.name)) return null;

  return { id: user.id, name: user.name, email: user.email, role: user.role.name };
}
