import Link from "next/link";
import { ReactNode } from "react";
import { useRouter } from "next/router";
import styles from "./Layout.module.css";
import { SidebarProvider } from "./SidebarContext";

interface Props {
  children: ReactNode;
}

const Layout: React.FC<Props> = ({ children }) => {
  const router = useRouter();
  return (
    <SidebarProvider>
    <div>
      <nav className={styles.nav}>
        <Link href="/" className={`${styles.link} ${router.pathname === "/" ? styles.active : ""}`}>Keeper Helper</Link>
        <Link href="/rules" className={`${styles.link} ${router.pathname.startsWith("/rules") ? styles.active : ""}`}>League Rules</Link>
        <Link href="/draftboard" className={`${styles.link} ${router.pathname.startsWith("/draftboard") ? styles.active : ""}`}>Draft Board</Link>
      </nav>
      <div className={styles.content}>{children}</div>
    </div>
    </SidebarProvider>
  );
};

export default Layout; 