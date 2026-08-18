import { AppHeader } from "@/components/layout/app-header";
import { requireUser } from "@/lib/auth/session";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  // Validation réelle de la session, là où le proxy ne fait que constater la
  // présence d'un cookie.
  const user = await requireUser();

  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <AppHeader userName={user.name || user.email} />
      <main className="min-h-0 flex-1">{children}</main>
    </div>
  );
}
