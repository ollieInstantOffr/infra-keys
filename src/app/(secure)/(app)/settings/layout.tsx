import { SettingsNav } from "@/components/settings/settings-nav";
import styles from "@/components/settings/settings.module.css";

export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className={styles.layout}>
      <SettingsNav />
      <div className={styles.content}>{children}</div>
    </div>
  );
}
