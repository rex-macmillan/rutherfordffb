import React from "react";
import styles from "./KeeperSidebar.module.css";
import { useSidebar } from "./SidebarContext";

interface PlayerInfo { playerId: string; name: string; position: string; teamAbbr: string; rank: number; }
interface Props { players: PlayerInfo[]; }

const BestPlayersSidebar: React.FC<Props> = ({ players }) => {
  const { open, setOpen } = useSidebar();
  const isOpen = open === "best";
  return (
    <>
      <button
        className={styles.toggle}
        style={{ top: "6rem" }}
        onClick={() => setOpen(isOpen ? null : "best")}
      >
        {isOpen ? "×" : "Best Available"}
      </button>
      <aside className={`${styles.sidebar} ${isOpen ? styles.open : ""}`}>
        <h3>Best Remaining Players</h3>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Rank</th>
              <th>Player</th>
              <th>Pos</th>
              <th>Team</th>
            </tr>
          </thead>
          <tbody>
            {players.slice(0, 200).map((p, idx) => (
              <tr key={p.playerId}>
                <td>{`${idx + 1} (${p.rank})`}</td>
                <td>{p.name}</td>
                <td>{p.position}</td>
                <td>{p.teamAbbr}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </aside>
    </>
  );
};

export default BestPlayersSidebar; 