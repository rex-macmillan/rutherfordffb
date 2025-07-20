import React from "react";
import styles from "./KeeperSidebar.module.css"; // reuse same styles
import { useSidebar } from "./SidebarContext";

interface TeamOption { rosterId: number; teamName: string }
interface DeltaInfo { extra: string[]; missing: string[] }
interface Props { teams: TeamOption[]; deltas: Record<number, DeltaInfo> }

const DraftDeltaSidebar: React.FC<Props> = ({ teams, deltas }) => {
  const { open, setOpen } = useSidebar();
  const isOpen = open === "draft";
  return (
    <>
      <button className={styles.toggle} style={{ top: "6rem"}} onClick={() => setOpen(isOpen ? null : "draft")}>
        {isOpen ? "×" : "Draft Picks"}
      </button>
      <aside className={`${styles.sidebar} ${isOpen ? styles.open : ""}`}>
        <h3>Draft Pick Deltas</h3>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Team</th>
              <th>Extra Picks</th>
              <th>Missing Picks</th>
            </tr>
          </thead>
          <tbody>
            {teams.map((t) => {
              const d = deltas[t.rosterId] || { extra: [], missing: [] };
              return (
                <tr key={t.rosterId}>
                  <td>{t.teamName}</td>
                  <td>{d.extra.join(", ") || "-"}</td>
                  <td>{d.missing.join(", ") || "-"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </aside>
    </>
  );
};

export default DraftDeltaSidebar; 