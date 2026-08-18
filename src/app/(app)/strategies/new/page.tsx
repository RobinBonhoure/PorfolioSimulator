import { EditorShell } from "@/components/strategy-editor/editor-shell";
import { requireUser } from "@/lib/auth/session";

export const metadata = {
  title: "Nouvelle stratégie — Simulateur de portefeuille",
};

export default async function NewStrategyPage() {
  await requireUser();

  return <EditorShell />;
}
