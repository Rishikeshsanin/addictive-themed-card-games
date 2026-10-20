// Shared round-reveal policy. Dates originate from the server; nobody may advance early.
export const REVEAL_DURATIONS=Object.freeze([2,3,5,8]);
export const DEFAULT_REVEAL=Object.freeze({mode:'auto',seconds:2});
export function validateRevealSettings(mode,seconds){
 if(mode!=='auto'&&mode!=='manual')throw Error('Invalid reveal mode');
 if(!REVEAL_DURATIONS.includes(Number(seconds)))throw Error('Reveal duration must be 2, 3, 5 or 8 seconds');
 return {mode,seconds:Number(seconds)};
}
export function revealDeadline(settings,now=Date.now()){
 const {mode,seconds}=validateRevealSettings(settings.mode,settings.seconds);
 return new Date(now+(mode==='manual'?90000:seconds*1000)).toISOString();
}
export function revealState({mode='auto',seconds=2,until=null,acks=[]}={},now=Date.now()){
 const policy=validateRevealSettings(mode,seconds);
 const validUntil=until?Date.parse(until):NaN;
 const acknowledged=[...new Set(Array.isArray(acks)?acks.filter(x=>x===0||x===1):[])];
 const active=Number.isFinite(validUntil)&&now<validUntil&&(mode==='auto'||acknowledged.length<2);
 return {...policy,until:until||null,acks:acknowledged,active};
}
export function mayAdvance(reveal,now=Date.now()){return !revealState(reveal,now).active}
