import React from "react";
import styles from "./DraftBoard.module.css";

interface TeamOption { rosterId:number; teamName:string }
interface TradedPickMap { [key:string]: { ownerRosterId:number } }

interface Props {
  slots: number[]; // slot numbers 1..n
  teams: TeamOption[]; // rosterId mapping for header names
  picksByRound: { [round:number]: { [slot:number]: { rosterId:number; traded:boolean; fromRosterId?:number; keeper?:boolean; playerName?:string; position?:string } } };
  maxRound: number;
  rosterIdToName: Record<number,string>;
}

const DraftBoard:React.FC<Props>=({slots,teams,picksByRound,maxRound,rosterIdToName})=>{
  const cols = slots.length+1;
  return (
    <div className={styles.wrapper}>
      <div className={styles.board} style={{gridTemplateColumns:`80px repeat(${slots.length},90px)`}}>
        {/* header row */}
        <div className={styles.headerCell}></div>
        {slots.map((s)=>{
          const rid = picksByRound[1]?.[s]?.rosterId;
          return <div key={"h"+s} className={styles.headerCell}>{rosterIdToName[rid]||`Slot ${s}`}</div>;
        })}
        {/* rounds */}
        {Array.from({length:maxRound},(_,i)=>i+1).map((round)=>[
          <div key={`r${round}`} className={styles.roundCell}>{round}</div>,
          ...slots.map((slot)=>{
            const cell = picksByRound[round]?.[slot];
            const key=`${round}-${slot}`;
            if(!cell) return <div key={key} className={styles.pickCell}></div>;
            const label = round %2===1 ? `${round}.${slot}` : `${round}.${slots.length - slot + 1}`;
            return (
              <div key={key} className={styles.pickCell}>
                {cell.keeper ? (
                  <div className={styles.kept}>{cell.playerName}<br/><span style={{fontSize:"0.7rem",color:"#64748b"}}>{cell.position}</span></div>
                ) : cell.traded ? (
                  <div className={styles.traded}>→ TRADED<br/>{rosterIdToName[cell.rosterId]}<br/>{label}</div>
                ) : label}
              </div>
            );
          })
        ])}
      </div>
    </div>
  );
};

export default DraftBoard; 