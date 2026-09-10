import { Suspense } from "react";
import { NotesScreen } from "@/components/vault/notes-screen";

export const metadata = { title: "Secure notes" };

export default function NotesPage() {
  return (
    <Suspense>
      <NotesScreen />
    </Suspense>
  );
}
