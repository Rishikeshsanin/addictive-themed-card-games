// Pure DeckVerse room presence policy. Call only with server-authenticated players and
// server/DB timestamps, inside the coordinator's existing room row-lock discipline.
// NO network, database, timers, storage or room/game-state side effects.
const MINUTE = 60_000;
export const DEFAULT_PRESENCE_POLICY = Object.freeze({
  heartbeatIntervalMs: 15_000,
  suspectAfterMs: 45_000,
  graceMs: Object.freeze({lobby: 2 * MINUTE, playing: 5 * MINUTE, finished: 3 * MINUTE}),
  abandonedMs: Object.freeze({lobby: 30 * MINUTE, playing: 24 * 60 * MINUTE, finished: 30 * MINUTE}),
});
// Accessible retention is finite. Historic rows are retained for a separately
// authorized archival/purge process. These TTLs match abandonedMs by phase.
export const ROOM_RETENTION_SECONDS = Object.freeze({
  lobby:30*60, playing:24*60*60, finished:30*60,
});
export function retentionSeconds(status){
 if(!Object.hasOwn(ROOM_RETENTION_SECONDS,status))throw new RangeError('Invalid room phase');
 return ROOM_RETENTION_SECONDS[status];
}
const PHASES = Object.freeze(['lobby', 'playing', 'finished']);
const STATES = Object.freeze(['online', 'grace', 'disconnected', 'left', 'unknown']);
const isMs = value => Number.isFinite(value) && value >= 0;
const serverTime = now => {
  const ms = now instanceof Date ? now.getTime() : now;
  if (!isMs(ms)) throw new TypeError('Expected a finite non-negative server timestamp');
  return ms;
};
const timestamp = value => {
  if (value == null) return null;
  const ms = value instanceof Date ? value.getTime() : typeof value === 'number' ? value : Date.parse(value);
  return isMs(ms) ? ms : null;
};
export function validatePresencePolicy(input = DEFAULT_PRESENCE_POLICY) {
  if (!input || typeof input !== 'object') throw new TypeError('Invalid presence policy');
  const {heartbeatIntervalMs, suspectAfterMs, graceMs, abandonedMs} = input;
  if (!Number.isSafeInteger(heartbeatIntervalMs) || heartbeatIntervalMs < 1000 ||
      !Number.isSafeInteger(suspectAfterMs) || suspectAfterMs < heartbeatIntervalMs * 2 ||
      !graceMs || !abandonedMs) throw new RangeError('Invalid heartbeat/presence thresholds');
  for (const phase of PHASES) {
    if (!Number.isSafeInteger(graceMs[phase]) || graceMs[phase] <= suspectAfterMs ||
        !Number.isSafeInteger(abandonedMs[phase]) || abandonedMs[phase] <= graceMs[phase]) {
      throw new RangeError(`Invalid ${phase} grace/abandonment thresholds`);
    }
  }
  return input;
}
function phaseOf(status) {
  if (!PHASES.includes(status)) throw new RangeError('Invalid room status');
  return status;
}
/** Distinct intent: active=false is an explicit server-recorded departure, not a timeout. */
export function presenceOf(player, {status, now, policy = DEFAULT_PRESENCE_POLICY} = {}) {
  validatePresencePolicy(policy);
  phaseOf(status);
  const current = serverTime(now);
  if (!player || typeof player !== 'object') throw new TypeError('Invalid player');
  if (player.active === false) return {state:'left', ageMs:null};
  const last = timestamp(player.last_seen_at);
  // Do not penalize legacy rows without usable timestamps before rollout/backfill.
  if (last === null) return {state:'unknown', ageMs:null};
  const ageMs = Math.max(0, current - last); // future DB timestamps cannot create negative ages
  const state = ageMs < policy.suspectAfterMs ? 'online' :
    ageMs <= policy.graceMs[status] ? 'grace' : 'disconnected';
  return {state, ageMs};
}
/** For the same authenticated player/seat; server time only, monotonic under retries. */
export function advanceHeartbeat(player, {serverNow} = {}) {
  const current = serverTime(serverNow);
  if (!player || player.active !== true) throw new Error('Inactive or missing session cannot heartbeat');
  const previous = timestamp(player.last_seen_at);
  return {...player, last_seen_at: new Date(Math.max(previous ?? 0, current)).toISOString()};
}
function validSeats(players, playerCount) {
  if (!Array.isArray(players) || ![2,3,4].includes(playerCount)) throw new TypeError('Invalid roster');
  const seen = new Set();
  for (const player of players) {
    const seat = player?.seat;
    if (!Number.isInteger(seat) || seat < 0 || seat >= playerCount || seen.has(seat)) {
      throw new RangeError('Invalid or duplicate room seat');
    }
    seen.add(seat);
  }
}
/**
 * A non-destructive snapshot; transfer is a PROPOSAL for a locked DB transaction.
 * Presence itself never removes seats, grants wins, edits decks, or ends a match.
 */
export function evaluateRoomPresence({players, playerCount, hostSeat = 0, status, now,
  policy = DEFAULT_PRESENCE_POLICY} = {}) {
  validatePresencePolicy(policy);
  phaseOf(status);
  const current = serverTime(now);
  validSeats(players, playerCount);
  if (!Number.isInteger(hostSeat) || hostSeat < 0 || hostSeat >= playerCount) {
    throw new RangeError('Invalid host seat');
  }
  const roster = [...players].sort((a,b) => a.seat-b.seat)
    .map(p => ({seat:p.seat, ...presenceOf(p,{status,now:current,policy})}));
  const host = roster.find(p => p.seat === hostSeat);
  const hostGone = !host || host.state === 'left' || host.state === 'disconnected';
  // Only a clearly connected authenticated seat may become host. A grace-period
  // host retains control; an 'unknown' row is not treated as abandoned.
  const eligible = roster.filter(p => p.state === 'online').map(p => p.seat);
  const clockwise = [...eligible].sort((a,b) =>
    ((a-hostSeat+playerCount)%playerCount)-((b-hostSeat+playerCount)%playerCount));
  const proposedHostSeat = hostGone && clockwise.length ? clockwise[0] : hostSeat;
  const paused = status === 'playing' && (roster.length !== playerCount ||
    roster.some(p => p.state !== 'online'));
  const noConnected = roster.every(p => !['online','grace','unknown'].includes(p.state));
  const times = players.map(p => timestamp(p.last_seen_at));
  // Refuse automatic expiration if there is insufficient legacy timestamp evidence.
  const hasEvidence = players.length > 0 && times.every(t => t !== null);
  const lastActivity = hasEvidence ? Math.max(...times) : null;
  const abandoned = Boolean(hasEvidence && noConnected &&
    current - lastActivity >= policy.abandonedMs[status]);
  return {
    hostSeat: proposedHostSeat,
    hostChanged: proposedHostSeat !== hostSeat,
    paused,
    abandoned,
    roster,
    // The coordinator may expose this to clients; do not put token hashes here.
    reason: abandoned ? 'abandoned' : paused ? 'awaiting_reconnect' : null,
  };
}
export const PRESENCE_STATES = STATES;
