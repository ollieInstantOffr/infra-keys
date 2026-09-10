import { Suspense } from "react";
import { VaultScreen } from "@/components/vault/vault-screen";

export const metadata = { title: "Passwords" };

export default function VaultPage() {
  return (
    <Suspense>
      <VaultScreen />
    </Suspense>
  );
}
