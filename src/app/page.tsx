import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth/config";
import { isLocalPreviewMode } from "@/lib/auth/local-preview";

export default async function HomePage() {
  if (isLocalPreviewMode()) redirect("/workspace");

  const session = await getServerSession(authOptions);
  redirect(session?.user ? "/workspace" : "/login");
}
