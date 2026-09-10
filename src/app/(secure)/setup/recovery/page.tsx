import { AuthShell } from "@/components/auth/auth-shell";
import { RecoveryKit } from "@/components/auth/recovery-kit";
import { getCurrentUser } from "@/lib/auth/session";

export const metadata = { title: "Save your recovery kit" };

export default async function RecoveryPage() {
  const user = await getCurrentUser();
  return (
    <AuthShell width={520} align="start">
      <RecoveryKit email={user?.email ?? ""} />
    </AuthShell>
  );
}
