import { AuthShell } from "@/components/auth/auth-shell";
import { LinkSent } from "@/components/auth/link-sent";

export const metadata = { title: "Check your inbox" };

export default async function SentPage({
  searchParams,
}: {
  searchParams: Promise<{ to?: string }>;
}) {
  const { to } = await searchParams;
  return (
    <AuthShell>
      <LinkSent email={to ?? "your inbox"} />
    </AuthShell>
  );
}
