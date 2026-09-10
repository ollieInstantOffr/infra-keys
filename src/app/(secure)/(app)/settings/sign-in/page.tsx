import { Suspense } from "react";
import { SignInSettings } from "@/components/settings/sign-in";

export const metadata = { title: "Sign-in & recovery" };

export default function SignInSettingsPage() {
  return (
    <Suspense>
      <SignInSettings />
    </Suspense>
  );
}
