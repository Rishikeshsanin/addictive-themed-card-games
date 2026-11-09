// Stateless eligibility and consent; the API must run this under its locked room transaction.
// expectedMatchNumber is optional for backward compatibility until the coordinator wires it.
// Once the API forwards it, delayed votes from an earlier match are rejected.
export function decideRematch({status,state,players,seat,expectedMatchNumber}){
 if(status!=='finished'||state?.status!=='finished')return {error:'A rematch can only begin after the match ends.'};
 if(state.endReason==='forfeit'||state.endReason==='player_left'||state.status==='aborted')return {error:'A player left the match. Create a new room.'};
 const required=state.playerCount||2;
 if(!Number.isInteger(required)||required<2||required>4)return {error:'Invalid rematch roster size.'};
 if(expectedMatchNumber!==undefined&&expectedMatchNumber!==null&&
    (!Number.isSafeInteger(expectedMatchNumber)||expectedMatchNumber!==(state.matchNumber||1)))
  return {error:'That rematch request belongs to a previous match. Refresh and try again.'};
 if(!Array.isArray(players)||players.length!==required||!players.every(p=>p.active!==false))
  return {error:'All original players are needed for a rematch.'};
 const seats=players.map(p=>p.seat);
 if(new Set(seats).size!==required||seats.some(s=>!Number.isInteger(s)||s<0||s>=required))
  return {error:'The original player seats are incomplete or duplicated.'};
 if(!seats.includes(seat))return {error:'Player is not a participant.'};
 const votes=[...new Set([...players.filter(p=>p.ready===true).map(p=>p.seat),seat])].sort((a,b)=>a-b);
 return {votes,restart:votes.length===required};
}
