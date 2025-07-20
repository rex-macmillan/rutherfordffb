import React from "react";
import styles from "./KeeperSidebar.module.css"; // reuse same css
import { useSidebar } from "./SidebarContext";

interface PlayerInfo {
  playerId: string;
  name: string;
  position: string;
  roster: string;
}

interface Props {
  players: PlayerInfo[];
}

const KeepersListSidebar: React.FC<Props> = ({ players }) => {
  const { open, setOpen } = useSidebar();
  const isOpen = open === "keepers";
  return (
    <>
      <button
        className={styles.toggle}
        onClick={() => setOpen(isOpen ? null : "keepers")}
      >
        {isOpen ? "×" : "Keepers"}
      </button>
      <aside className={`${styles.sidebar} ${isOpen ? styles.open : ""}`}>
        <h3>Saved Keepers</h3>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>#</th>
              <th>Player</th>
              <th>Pos</th>
              <th>Roster</th>
            </tr>
          </thead>
          <tbody>
            {players.map((p, idx) => (
              <tr key={p.playerId}>
                <td>{idx + 1}</td>
                <td>{p.name}</td>
                <td>{p.position}</td>
                <td>{p.roster}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </aside>
    </>
  );
};

export default KeepersListSidebar; 