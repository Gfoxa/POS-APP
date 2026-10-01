import "server-only";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { getPrismaClient } from "@/lib/db/prisma";
import { canAccessRoute, isUserRole, type AppRoute, type UserRole } from "@/lib/permissions/roles";
import { authOptions } from "@/lib/auth/config";
import { isLocalPreviewMode, LOCAL_PREVIEW_USER } from "@/lib/auth/local-preview";

export type AuthenticatedUser = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
};

export async function getAuthenticatedUser(): Promise<AuthenticatedUser | null> {
  if (isLocalPreviewMode()) return LOCAL_PREVIEW_USER;

  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  if (!userId) return null;

  const user = await getPrismaClient().user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      email: true,
      isActive: true,
      role: { select: { name: true } },
    },
  });

  if (!user?.isActive || !isUserRole(user.role.name)) return null;

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role.name,
  };
}

export async function requireAuthenticatedUser(): Promise<AuthenticatedUser> {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireRouteAccess(
  route: AppRoute,
): Promise<AuthenticatedUser> {
  const user = await requireAuthenticatedUser();
  if (!canAccessRoute(user.role, route)) redirect("/unauthorized");
  return user;
}
