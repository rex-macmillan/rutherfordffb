import Link from "next/link";
import { ReactNode, useState } from "react";
import { useRouter } from "next/router";
import styles from "./Layout.module.css";
import { SidebarProvider } from "./SidebarContext";

interface Props {
  children: ReactNode;
}

const Layout: React.FC<Props> = ({ children }) => {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <SidebarProvider>
    <div>
      <nav className={styles.nav}>
        <button className={styles.hamburger} onClick={()=>setMenuOpen(o=>!o)}>
          {menuOpen? "×" : "☰"}
        </button>
        <div className={`${styles.links} ${menuOpen? styles.open: ""}`} onClick={()=>setMenuOpen(false)}>
          <Link href="/" className={`${styles.link} ${router.pathname === "/" ? styles.active : ""}`}>Keeper Helper</Link>
          <Link href="/rules" className={`${styles.link} ${router.pathname.startsWith("/rules") ? styles.active : ""}`}>League Rules</Link>
          <Link href="/draftboard" className={`${styles.link} ${router.pathname.startsWith("/draftboard") ? styles.active : ""}`}>Draft Board</Link>
          <Link href="/playoffs" className={`${styles.link} ${router.pathname.startsWith("/playoffs") ? styles.active : ""}`}>Playoffs</Link>
        </div>
      </nav>
      <div className={styles.content}>{children}</div>
    </div>
    </SidebarProvider>
  );
};

export default Layout; 