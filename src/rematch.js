// Stateless rematch eligibility/consent. The API performs this decision inside a locked room transaction.
export function decideRematch({status,state,players,seat}){
 if(status!=='finished'||state?.status!=='finished')return {error:'A rematch can only begin after the match ends.'};
 if(state.endReason==='forfeit'||state.endReason==='player_left')return {error:'A player left the match. Create a new room.'};
 const required=state.playerCount||2;
 if(!Number.isInteger(required)||required<2||required>4)return {error:'Invalid rematch roster size.'};
 if(!Array.isArray(players)||players.length!==required||!players.every(p=>p.active!==false))
  return {error:'All original players are needed for a rematch.'};
 if(!players.some(p=>p.seat===seat))return {error:'Player is not a participant.'};
 const readySeats=players.filter(p=>p.ready).map(p=>p.seat);
 const votes=[...new Set([...readySeats,seat])].sort((a,b)=>a-b);
 return {votes,restart:votes.length===required};
}
