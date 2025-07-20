import React from "react";
import styles from "./KeeperSidebar.module.css";
import { useSidebar } from "./SidebarContext";

const mapping: Array<[string, string]> = [
  ["1", "1"],
  ["2", "1"],
  ["3", "2"],
  ["4", "3"],
  ["5", "4"],
  ["6", "5"],
  ["7", "6"],
  ["8", "6"],
  ["9", "7"],
  ["10", "8"],
  ["11", "9"],
  ["12", "10"],
  ["13", "10"],
  ["14", "10"],
  ["15", "11"],
  ["16", "11"],
  ["17", "11"],
  ["Undrafted", "6"]
];

const KeeperSidebar: React.FC = () => {
  const { open, setOpen } = useSidebar();
  const isOpen = open === "keeper";
  return (
    <>
      <button className={styles.toggle} onClick={() => setOpen(isOpen ? null : "keeper") }>
        {isOpen ? "×" : "Keeper Rules"}
      </button>
      <aside className={`${styles.sidebar} ${isOpen ? styles.open : ""}`}>
        <h3>Keeper Mapping</h3>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Drafted</th>
              <th>Keeper Cost</th>
            </tr>
          </thead>
          <tbody>
            {mapping.map(([d, k]) => (
              <tr key={d}>
                <td>{d}</td>
                <td>{k}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </aside>
    </>
  );
};

export default KeeperSidebar; 