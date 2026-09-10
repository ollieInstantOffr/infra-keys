import { Suspense } from "react";
import { AuthShell } from "@/components/auth/auth-shell";
import { TouchIdSetup } from "@/components/auth/touch-id-setup";
import { getCurrentUser } from "@/lib/auth/session";

export const metadata = { title: "Set up Touch ID" };

export default async function TouchIdSetupPage() {
  const user = await getCurrentUser();
  return (
    <AuthShell width={460}>
      <Suspense>
        <TouchIdSetup email={user?.email ?? ""} />
      </Suspense>
    </AuthShell>
  );
}
