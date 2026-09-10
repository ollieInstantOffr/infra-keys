import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { AuthSplit } from "@/components/auth/auth-shell";
import { Wordmark } from "@/components/ui/key-mark";
import { SignInForm } from "@/components/auth/sign-in-form";

export const metadata = { title: "Sign in" };

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ deleted?: string }>;
}) {
  const user = await getCurrentUser();
  if (user) redirect("/vault");

  const { deleted } = await searchParams;

  return (
    <AuthSplit
      hero={
        <>
          <Wordmark size={22} tile={32} />
          <h1
            style={{
              font: "800 54px/1.04 var(--font-sans)",
              letterSpacing: "-0.035em",
              margin: 0,
              textWrap: "pretty",
            }}
          >
            No master password. Just your inbox and your fingerprint.
          </h1>
          <p
            style={{
              font: "400 17px/1.55 var(--font-sans)",
              color: "var(--text)",
              margin: 0,
              textWrap: "pretty",
            }}
          >
            Sign in with a one-time link, then unlock with Touch ID on this
            device.
          </p>
        </>
      }
    >
      <SignInForm deleted={deleted === "1"} />
    </AuthSplit>
  );
}
