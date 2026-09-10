import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { VaultProvider } from "@/components/vault/vault-provider";

/**
 * Everything behind a session lives here. The provider spans setup, unlock
 * and the vault itself so the decrypted key survives client navigation
 * between them — it never touches storage.
 */
export default async function SecureLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/signin");

  return <VaultProvider>{children}</VaultProvider>;
}
