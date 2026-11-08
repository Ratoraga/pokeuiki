import { isDamaging, specOf } from "./data";
import {
  activeMon, at, avgHits, calcDamageBetween, canDynamax, canInflict, canMega, canSwitch, canTera, canZ,
  effMove, effSpeedOf, fixedDamage, moveEffectiveness, otherSide, statusFromAilment, targetsSelf,
  toStageKey, usableMoves, weatherActive, canGigantamax, legalActions, playTurn, replaceFainted,
  resumePivot, typeMult
} from "./engine";
import type { Action, BattleMoveData, BattleState, Mon, Rng, SideIndex, MoveAction, Status } from "./types";
import { TYPES } from "../pokemonTypes";

const sashProtected = (m: Mon) => (m.item === "focus-sash" || m.ability === "sturdy") && m.hp === m.maxHp;

interface Est { min: number; max: number; avg: number; eff: number }
const ZERO: Est = { min: 0, max: 0, avg: 0, eff: 0 };

function estimate(s: BattleState, att: Mon, aSide: SideIndex, def: Mon, dSide: SideIndex, rawMove: BattleMoveData): Est {
  const move = effMove(att, rawMove);
  const spec = specOf(move);
  const acc = (move.accuracy ?? 100) / 100;
  if (spec.ohko) return att.data.level >= def.data.level ? { min: 0, max: def.hp, avg: def.hp * 0.3, eff: 1 } : ZERO;
  const eff = moveEffectiveness(s, att, def, move);
  if (eff === 0) return ZERO;
  if (spec.fixed !== undefined) { const d = fixedDamage(att, def, spec.fixed, () => 0.5); return { min: d, max: d, avg: d * acc, eff }; }
  if (spec.counter) { const d = Math.floor(att.maxHp * 0.3); return { min: 0, max: d, avg: d * 0.5, eff }; }
  const r = calcDamageBetween(s, att, aSide, def, dSide, move);
  return { min: r.min * (move.min_hits ?? 1), max: r.max * (move.max_hits ?? 1), avg: ((r.min + r.max) / 2) * avgHits(move) * acc, eff };
}

interface Best { avgPct: number; ko: boolean; priorityKo: boolean; physical: boolean }

function bestOf(s: BattleState, att: Mon, aSide: SideIndex, def: Mon, dSide: SideIndex): Best {
  const best: Best = { avgPct: 0, ko: false, priorityKo: false, physical: false };
  for (const i of usableMoves(att)) {
    const mv = at(att.data.moves, i);
    if (!isDamaging(mv)) continue;
    const e = estimate(s, att, aSide, def, dSide, mv);
    const pct = e.avg / Math.max(1, def.hp);
    if (pct > best.avgPct) { best.avgPct = pct; best.physical = mv.damage_class === "physical"; }
    if (e.min >= def.hp && !sashProtected(def)) { best.ko = true; if (mv.priority > 0) best.priorityKo = true; }
  }
  return best;
}

/** Quem age primeiro (considera Trick Room). */
function isQuicker(s: BattleState, a: Mon, aSide: SideIndex, b: Mon, bSide: SideIndex): boolean {
  const fa = effSpeedOf(s, a, aSide), fb = effSpeedOf(s, b, bSide);
  return s.field.trickRoom > 0 ? fa < fb : fa > fb;
}

function matchup(s: BattleState, side: SideIndex, a: Mon): number {
  const fSide = otherSide(side);
  const foe = activeMon(s, fSide);
  const mine = bestOf(s, a, side, foe, fSide);
  const theirs = bestOf(s, foe, fSide, a, side);
  const quick = isQuicker(s, a, side, foe, fSide);
  let v = 50 * Math.min(mine.avgPct, 1.5) - 50 * Math.min(theirs.avgPct, 1.5);
  v += quick ? 12 : -12;
  if (mine.ko && (quick || mine.priorityKo)) v += 40;
  if (theirs.ko && (!quick || theirs.priorityKo)) v -= 40;
  return v;
}

export function scoreMove(s: BattleState, side: SideIndex, index: number): number {
  const me = activeMon(s, side);
  const fSide = otherSide(side);
  const foe = activeMon(s, fSide);
  const move = at(me.data.moves, index);
  const spec = specOf(move);
  const hpFrac = me.hp / me.maxHp;
  const quick = isQuicker(s, me, side, foe, fSide);
  const threat = bestOf(s, foe, fSide, me, side);
  const threatened = threat.ko && (!quick || threat.priorityKo);
  const acc = (move.accuracy ?? 100) / 100;
  const foeSide = s.sides[fSide];
  const foeReserves = foeSide.team.filter((m, i) => !m.fainted && i !== foeSide.active).length;
  const mySide = s.sides[side];

  // ---- dano ----
  if (isDamaging(move)) {
    const e = estimate(s, me, side, foe, fSide, move);
    if (e.eff === 0) return -200;
    let score = 50 * Math.min(e.avg / Math.max(1, foe.hp), 1.5);
    if (e.eff > 1) score += 10; else if (e.eff < 1) score -= 10;
    const koable = !sashProtected(foe);
    const kills = koable && e.min >= foe.hp;
    if (kills) { score += 60 * acc; if (quick || move.priority > 0) score += 15; }
    else if (koable && e.max >= foe.hp) score += 15 * acc;
    if (!kills) {
      if (move.drain < 0) score -= 5;
      if (move.category === "damage-raise" && move.stat_changes.some((c) => c.change < 0)) score -= 8;
      if (spec.recharge) score -= 25;
      if (spec.twoTurn && !(spec.twoTurn === "sun" && weatherActive(s) === "sun")) score -= 20;
      if (spec.rampage) score -= 10;
      if (spec.selfKo) score += hpFrac < 0.25 && e.avg > foe.hp * 0.5 ? 40 : -60;
      if (spec.sucker || spec.firstTurn) score += me.turnsOut === 0 || spec.sucker ? 5 : -200;
    }
    if (spec.pivot) score += threatened || matchup(s, side, me) < -20 ? 18 : 3;
    if (spec.clearHazards && (mySide.hazards.stealthRock || mySide.hazards.spikes > 0)) score += 20;
    if (spec.forceSwitch) score += foe.stages.atk + foe.stages.spa + foe.stages.spe > 2 ? 25 : 0;
    return score;
  }

  // ---- status e campo ----
  if (spec.protect) {
    if (me.v.protectCount > 0) return -100;
    return threatened ? 30 : foe.status === "tox" || foe.status === "psn" || foe.status === "brn" ? 15 : -10;
  }
  if (spec.weather) return weatherActive(s) === spec.weather ? -200 : me.turnsOut === 0 ? 45 : 15;
  if (spec.terrain) return s.field.terrain === spec.terrain ? -200 : me.turnsOut === 0 ? 40 : 10;
  if (spec.trickRoom) return s.field.trickRoom > 0 ? (quick ? 0 : -80) : quick ? -40 : 45;
  if (spec.tailwind) return mySide.tailwind > 0 ? -200 : 35;
  if (spec.screen) {
    if (mySide.screens[spec.screen] > 0) return -200;
    if (spec.screen === "auroraVeil") return ["snow", "hail"].includes(weatherActive(s) ?? "") ? 45 : -200;
    return bestOf(s, foe, fSide, me, side).physical === (spec.screen === "reflect") ? 40 : 15;
  }
  if (spec.hazard) {
    const h = foeSide.hazards;
    const full = spec.hazard === "stealthRock" || spec.hazard === "stickyWeb" ? h[spec.hazard] : h[spec.hazard] >= (spec.hazard === "spikes" ? 3 : 2);
    return full || foeReserves === 0 ? -200 : 30 + foeReserves * 6;
  }
  if (spec.clearHazards) return mySide.hazards.stealthRock || mySide.hazards.spikes > 0 || mySide.hazards.toxicSpikes > 0 ? 35 : -200;
  if (spec.substitute) return me.v.substitute > 0 || hpFrac <= 0.5 ? -200 : foe.status || !quick ? 30 : 5;
  if (spec.leechSeed) return foe.v.leechSeed || foe.types.includes("grass") ? -200 : 38;
  if (spec.yawn) return foe.v.yawn > 0 || !canInflict(s, foe, "slp") ? -200 : 25;
  if (spec.taunt) return foe.v.taunt > 0 ? -200 : foe.data.moves.filter((m) => m.damage_class === "status").length >= 2 ? 28 : 5;
  if (spec.wish) return mySide.wish ? -200 : hpFrac < 0.7 ? 35 : -20;
  if (spec.rest) return hpFrac < 0.5 && me.status !== "slp" ? 55 : -100;
  if (spec.bellyDrum) return me.turnsOut === 0 && hpFrac > 0.9 && !threat.ko ? 70 : -200;
  if (spec.curse || spec.focusEnergy || spec.destinyBond || spec.ingrain || spec.aquaRing) return 5;
  if (spec.haze) return me.stages.atk + me.stages.spa + me.stages.spe < -2 || foe.stages.atk + foe.stages.spa + foe.stages.spe > 2 ? 40 : -50;
  if (spec.cureTeam || spec.cureSelf) return mySide.team.some((m) => m.status && !m.fainted) ? 40 : -200;
  if (spec.painSplit) return foe.hp > me.hp * 1.5 ? 40 : -100;
  if (spec.trick) return me.item?.startsWith("choice-") && foe.item ? 25 : -80;
  if (spec.heal !== undefined) {
    if (hpFrac >= 0.8) return -100;
    if (hpFrac > 0.5) return -30;
    return threat.avgPct * me.hp > me.maxHp * 0.5 ? 10 : 65 - (threat.ko && !quick ? 20 : 0);
  }
  if (spec.pivot) return matchup(s, side, me) < -20 ? 30 : -10;

  if (spec.noop) return -200;
  if (Object.keys(spec).length > 0) return 8;
  switch (move.category) {
    case "ailment": {
      const st = statusFromAilment(move);
      if (st) {
        if (!canInflict(s, foe, st)) return -200;
        let v = 35;
        if (st === "par") v += isQuicker(s, foe, fSide, me, side) ? 20 : 5;
        if (st === "brn") v += bestOf(s, foe, fSide, me, side).physical ? 20 : 0;
        if (st === "slp") v += 30;
        if (threatened) v -= 30;
        return v * acc;
      }
      if (move.ailment === "confusion") return foe.v.confusion > 0 ? -200 : 25;
      if (move.ailment === "trap") return foe.v.trap > 0 ? -200 : 20;
      return -200;
    }
    case "swagger": return foe.v.confusion > 0 ? -50 : 15;
    case "net-good-stats": {
      if (!targetsSelf(move)) {
        let gain = 0;
        for (const c of move.stat_changes) { const k = toStageKey(c.stat); if (k && c.change < 0) gain += foe.stages[k] > -3 ? 12 * -c.change : -30; }
        return gain - (threatened ? 20 : 0);
      }
      const hasPhys = me.data.moves.some((m) => isDamaging(m) && m.damage_class === "physical");
      const hasSpec = me.data.moves.some((m) => isDamaging(m) && m.damage_class === "special");
      let useful = 0, stack = 0;
      for (const c of move.stat_changes) {
        const k = toStageKey(c.stat);
        if (!k || c.change <= 0) continue;
        if (me.stages[k] >= 6) return -200;
        if ((k === "atk" && !hasPhys) || (k === "spa" && !hasSpec)) continue;
        useful++;
        stack += Math.max(0, me.stages[k] - 1) * 25;
      }
      if (useful === 0) return -100;
      const base = me.turnsOut === 0 && hpFrac > 0.7 && !threat.ko ? 70 : hpFrac <= 0.5 || threat.ko ? -30 : 30;
      return base - stack;
    }
    case "heal": {
      if (hpFrac >= 0.8) return -100;
      if (hpFrac > 0.5) return -30;
      return threat.avgPct * me.hp > (move.healing / 100) * me.maxHp ? 10 : 65 - (threat.ko && !quick ? 20 : 0);
    }
    default: return -200;
  }
}

function considerSwitch(s: BattleState, side: SideIndex, bestScore: number): number | null {
  if (s.lastWasSwitch[side]) return null;
  const st = s.sides[side];
  const me = at(st.team, st.active);
  if (!canSwitch(s, side)) return null;
  const fSide = otherSide(side);
  const foe = activeMon(s, fSide);
  const bench = st.team.map((m, i) => ({ m, i })).filter(({ m, i }) => !m.fainted && i !== st.active);
  if (bench.length === 0) return null;

  const threat = bestOf(s, foe, fSide, me, side);
  const mine = bestOf(s, me, side, foe, fSide);
  const quick = isQuicker(s, me, side, foe, fSide);
  const doomed = threat.ko && (!quick || threat.priorityKo) && !(mine.priorityKo && !threat.priorityKo);
  if (!doomed && bestScore >= 20) return null;

  const stay = matchup(s, side, me);
  let best: { i: number; value: number } | null = null;
  for (const { m, i } of bench) {
    const incoming = bestOf(s, foe, fSide, m, side);
    const penalty = 40 * Math.min(incoming.avgPct, 1.2) + (incoming.ko ? 40 : 0);
    const value = matchup(s, side, m) - penalty;
    if (!best || value > best.value) best = { i, value };
  }
  return best && best.value > stay + 35 ? best.i : null;
}

export function pickGimmick(s: BattleState, side: SideIndex, moveIndex: number): Pick<Extract<Action, { kind: "move" }>, "gimmick" | "teraType" | "gmax"> {
  const me = activeMon(s, side);
  const foe = activeMon(s, otherSide(side));
  const alive = s.sides[side].team.filter((m) => !m.fainted).length;
  if (canMega(s, side)) return { gimmick: "mega" };
  const mv = at(me.data.moves, moveIndex);
  if (canZ(s, side, moveIndex) && isDamaging(mv) && foe.hp > foe.maxHp * 0.4) return { gimmick: "z" };
  if (canDynamax(s, side) && alive <= 3 && me.hp > me.maxHp * 0.6) return { gimmick: "dynamax", gmax: canGigantamax(s, side) };
  if (canTera(s, side) && (alive <= 3 || me.hp < me.maxHp)) {
    let bestType = me.types[0] ?? "normal";
    let top = -1;
    for (const i of usableMoves(me)) {
      const m = at(me.data.moves, i);
      if (!isDamaging(m)) continue;
      const e = estimate(s, me, side, foe, otherSide(side), m);
      if (e.avg > top && me.baseTypes.includes(m.type)) { top = e.avg; bestType = m.type; }
    }
    return { gimmick: "tera", teraType: alive <= 2 && top > 0 ? "stellar" : bestType };
  }
  return {};
}

export function chooseHeuristic(s: BattleState, side: SideIndex, rng: Rng): Action {
  const me = activeMon(s, side);
  const foe = activeMon(s, otherSide(side));
  if (me.v.recharge) return { kind: "move", index: -1 };
  const usable = usableMoves(me);
  if (usable.length === 0) return { kind: "move", index: -1 };

  const scored = usable.map((i) => ({ i, score: scoreMove(s, side, i) }));
  let topDamage = 0, topIndex = -1;
  for (const { i } of scored) {
    const mv = at(me.data.moves, i);
    if (!isDamaging(mv)) continue;
    const e = estimate(s, me, side, foe, otherSide(side), mv);
    if (e.eff > 0 && e.avg > topDamage) { topDamage = e.avg; topIndex = i; }
  }
  for (const x of scored) { if (x.i === topIndex) x.score += 12; x.score += rng() * 3; }
  scored.sort((a, b) => b.score - a.score);

  const best = at(scored, 0);
  const to = considerSwitch(s, side, best.score);
  if (to !== null) return { kind: "switch", to };
  return { kind: "move", index: best.i, ...pickGimmick(s, side, best.i) };
}

/** Escolhe o substituto (após desmaio ou U-turn). */
export function chooseReplacementHeuristic(s: BattleState, side: SideIndex): number {
  let bestIndex = -1, bestValue = -Infinity;
  s.sides[side].team.forEach((m, i) => {
    if (m.fainted || i === s.sides[side].active) return;
    const v = matchup(s, side, m);
    if (v > bestValue) { bestValue = v; bestIndex = i; }
  });
  if (bestIndex < 0) throw new Error("Sem Pokémon disponível para entrar");
  return bestIndex;
}

// ===============================================================
// Busca por simulação (níveis Difícil e Mestre)
// ===============================================================
export type BotLevel = "normal" | "hard" | "master";
let LEVEL: BotLevel = "hard";
export function setBotLevel(level: BotLevel): void { LEVEL = level; }
export const getBotLevel = (): BotLevel => LEVEL;

const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);
const clampN = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
const isSwitch = (a: Action): a is Extract<Action, { kind: "switch" }> => a.kind === "switch";
const isMove = (a: Action): a is MoveAction => a.kind === "move";

/** Sorteio com semente: todas as jogadas são comparadas com os mesmos "dados". */
function mulberry32(seed: number): Rng {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------- avaliação de um estado (do ponto de vista do bot) ----------
const STATUS_PEN: Record<Status, number> = { slp: 0.4, frz: 0.45, par: 0.2, brn: 0.2, psn: 0.12, tox: 0.2 };

function evaluate(s: BattleState, side: SideIndex): number {
  if (s.winner !== null) return s.winner === side ? 50 : -50;
  const power = (m: Mon) => m.data.stats.hp / 2 + m.data.stats.atk + m.data.stats.def + m.data.stats.spa + m.data.stats.spd + m.data.stats.spe;
  const all = [...s.sides[0].team, ...s.sides[1].team];
  const avg = all.reduce((n, m) => n + power(m), 0) / all.length;

  const sideScore = (sd: SideIndex): number => {
    const st = s.sides[sd];
    let total = 0;
    let bench = 0;
    st.team.forEach((m, i) => {
      if (m.fainted) return;
      const w = power(m) / avg;
      let v = w * (0.15 + 0.85 * (m.hp / m.maxHp)) * (1 - (m.status ? STATUS_PEN[m.status] : 0));
      if (i === st.active) {
        const g = m.stages;
        v += w * clampN(0.06 * Math.max(g.atk, g.spa) + 0.05 * g.spe + 0.025 * (g.def + g.spd), -0.3, 0.45);
        if (m.v.substitute > 0) v += 0.08 * w;
        if (m.v.confusion > 0) v -= 0.05 * w;
        if (m.v.leechSeed) v -= 0.1 * w;
        if (m.v.perish > 0) v -= 0.3 * w;
        if (m.v.recharge) v -= 0.1 * w;
        if (m.v.dynamax > 0) v += 0.15 * w;
      } else bench++;
      total += v;
    });
    const h = st.hazards;
    total -= bench * (0.12 * (h.stealthRock ? 1 : 0) + 0.05 * h.spikes + 0.04 * h.toxicSpikes + 0.03 * (h.stickyWeb ? 1 : 0));
    total += 0.08 * ((st.screens.reflect > 0 ? 1 : 0) + (st.screens.lightScreen > 0 ? 1 : 0) + (st.screens.auroraVeil > 0 ? 1 : 0));
    if (st.tailwind > 0) total += 0.1;
    if (st.wish) total += 0.1;
    return total;
  };
  return sideScore(side) - sideScore(otherSide(side));
}

// ---------- simulação ----------
function resolveForced(start: BattleState, rng: Rng): BattleState {
  let s = start;
  for (let guard = 0; guard < 8 && s.winner === null; guard++) {
    if (s.pivot !== null) {
      const sd = s.pivot;
      let to = -1;
      try { to = chooseReplacementHeuristic(s, sd); } catch { break; }
      s = resumePivot(s, sd, to, rng).state;
      continue;
    }
    const sd: SideIndex | null = s.pending[0] ? 0 : s.pending[1] ? 1 : null;
    if (sd === null) break;
    let to = -1;
    try { to = chooseReplacementHeuristic(s, sd); } catch { break; }
    s = replaceFainted(s, sd, to, rng).state;
  }
  return s;
}

function simulate(s: BattleState, side: SideIndex, mine: Action, theirs: Action, seed: number, twoPly: boolean): number {
  const rng = mulberry32(seed);
  try {
    const actions: [Action, Action] = side === 0 ? [mine, theirs] : [theirs, mine];
    let cur = resolveForced(playTurn(s, actions, rng).state, rng);
    if (twoPly && cur.winner === null) {
      const a0 = chooseHeuristic(cur, 0, rng);
      const a1 = chooseHeuristic(cur, 1, rng);
      cur = resolveForced(playTurn(cur, [a0, a1], rng).state, rng);
    }
    return evaluate(cur, side);
  } catch {
    return 0;
  }
}

// ---------- jogadas candidatas ----------
function threatType(s: BattleState, side: SideIndex): string | null {
  const foeSide = otherSide(side);
  const foe = activeMon(s, foeSide);
  const me = activeMon(s, side);
  let top = -1, type: string | null = null;
  for (const i of usableMoves(foe)) {
    const m = at(foe.data.moves, i);
    if (!isDamaging(m)) continue;
    const e = estimate(s, foe, foeSide, me, side, m);
    if (e.avg > top) { top = e.avg; type = m.type; }
  }
  return type;
}

/** Variações de Mega, Tera, Dynamax e Z que vale a pena simular para um golpe. */
function gimmickVariants(s: BattleState, side: SideIndex, index: number): Partial<MoveAction>[] {
  if (canMega(s, side)) return [{ gimmick: "mega" }];
  const me = activeMon(s, side);
  const foeSide = otherSide(side);
  const foe = activeMon(s, foeSide);
  const out: Partial<MoveAction>[] = [{}];
  if (index >= 0 && canZ(s, side, index)) out.push({ gimmick: "z" });
  if (canDynamax(s, side)) out.push({ gimmick: "dynamax", gmax: canGigantamax(s, side) });
  if (canTera(s, side)) {
    const types = new Set<string>();
    let top = -1, offensive = "";
    for (const i of usableMoves(me)) {
      const m = at(me.data.moves, i);
      if (!isDamaging(m) || !me.baseTypes.includes(m.type)) continue;
      const e = estimate(s, me, side, foe, foeSide, m);
      if (e.avg > top) { top = e.avg; offensive = m.type; }
    }
    if (offensive) types.add(offensive);
    const threat = threatType(s, side);
    if (threat) {
      let bestT = "", bestM = Infinity;
      for (const t of TYPES) { const mm = typeMult(threat, [t]); if (mm < bestM) { bestM = mm; bestT = t; } }
      if (bestT) types.add(bestT);
    }
    if (s.sides[side].team.filter((m) => !m.fainted).length <= 2) types.add("stellar");
    for (const t of [...types].slice(0, 3)) out.push({ gimmick: "tera", teraType: t });
  }
  return out;
}

function myCandidates(s: BattleState, side: SideIndex): Action[] {
  const legal = legalActions(s, side);
  const ranked = legal.filter(isMove)
    .map((a) => ({ a, score: a.index >= 0 ? scoreMove(s, side, a.index) : 0 }))
    .sort((x, y) => y.score - x.score);

  const out: Action[] = [];
  ranked.forEach(({ a }, rank) => {
    const variants: Partial<MoveAction>[] = rank < 2 ? gimmickVariants(s, side, a.index) : canMega(s, side) ? [{ gimmick: "mega" }] : [{}];
    for (const v of variants) out.push({ ...a, ...v } as Action);
  });

  const switches = legal.filter(isSwitch)
    .map((a) => ({ a, v: matchup(s, side, at(s.sides[side].team, a.to)) }))
    .sort((x, y) => y.v - x.v)
    .slice(0, 3)
    .map((x) => x.a);
  return [...out, ...switches];
}

/** Respostas prováveis do adversário e o quanto cada uma é provável. */
function theirCandidates(s: BattleState, side: SideIndex): { actions: Action[]; prior: number[] } {
  const foeSide = otherSide(side);
  const legal = legalActions(s, foeSide);
  const moves = legal.filter(isMove).map((a): Action => (canMega(s, foeSide) ? { ...a, gimmick: "mega" } : a));
  const switches = legal.filter(isSwitch)
    .map((a) => ({ a, v: matchup(s, foeSide, at(s.sides[foeSide].team, a.to)) }))
    .sort((x, y) => y.v - x.v)
    .slice(0, 2)
    .map((x) => x.a);

  const scores = legal.filter(isMove).map((a) => (a.index >= 0 ? scoreMove(s, foeSide, a.index) : 0));
  const top = Math.max(0, ...scores);
  const raw = [...scores.map((x) => Math.exp((x - top) / 12)), ...switches.map(() => Math.exp(-30 / 12))];
  const total = sum(raw) || 1;
  return { actions: [...moves, ...switches], prior: raw.map((x) => x / total) };
}

export function equilibriumCols(M: number[][], iters = 500): number[] {
  const R = M.length;
  const C = M[0]?.length ?? 0;
  if (C === 0) return [];
  let lo = Infinity, hi = -Infinity;
  for (const row of M) for (const v of row) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
  const span = hi - lo || 1;
  const N = M.map((row) => row.map((v) => (v - lo) / span));
  const eta = 0.25;
  let wr = new Array<number>(R).fill(1);
  let wc = new Array<number>(C).fill(1);
  const avgC = new Array<number>(C).fill(0);

  for (let t = 0; t < iters; t++) {
    const sr = sum(wr), sc = sum(wc);
    const p = wr.map((x) => x / sr);
    const q = wc.map((x) => x / sc);
    q.forEach((x, j) => { avgC[j] = (avgC[j] ?? 0) + x; });
    wr = wr.map((w, i) => w * Math.exp(eta * sum((N[i] ?? []).map((v, j) => v * (q[j] ?? 0)))));
    wc = wc.map((w, j) => w * Math.exp(-eta * sum(N.map((row, i) => (row[j] ?? 0) * (p[i] ?? 0)))));
    const mr = Math.max(...wr), mc = Math.max(...wc);
    wr = wr.map((x) => x / mr);
    wc = wc.map((x) => x / mc);
  }
  const total = sum(avgC) || 1;
  return avgC.map((x) => x / total);
}

function searchAction(s: BattleState, side: SideIndex, rng: Rng): Action {
  const rows = myCandidates(s, side);
  if (rows.length <= 1) return rows[0] ?? chooseHeuristic(s, side, rng);

  const { actions: cols, prior } = theirCandidates(s, side);
  const master = LEVEL === "master";
  const samples = master ? 3 : 2;
  const deadline = performance.now() + (master ? 3500 : 1800);
  const sums: number[][] = rows.map(() => cols.map(() => 0));
  const seed = Math.floor(rng() * 1e9);
  let done = 0;

  for (let k = 0; k < samples; k++) {
    rows.forEach((r, i) => {
      const line = sums[i] as number[];
      cols.forEach((c, j) => { line[j] = (line[j] ?? 0) + simulate(s, side, r, c, seed + k * 7919, master); });
    });
    done++;
    if (performance.now() > deadline) break; // a primeira rodada sempre termina
  }

  const M = sums.map((line) => line.map((v) => v / done));
  const eq = equilibriumCols(M);
  const mix = master ? 0.5 : 0.35; // quanto confiar no equilíbrio em vez do que um jogador razoável faria
  const q = cols.map((_, j) => mix * (eq[j] ?? 0) + (1 - mix) * (prior[j] ?? 0));

  let best = 0, bestV = -Infinity;
  rows.forEach((_, i) => {
    const v = sum((M[i] ?? []).map((x, j) => x * (q[j] ?? 0))) + rng() * 1e-3;
    if (v > bestV) { bestV = v; best = i; }
  });
  return at(rows, best);
}

export function chooseAction(s: BattleState, side: SideIndex, rng: Rng): Action {
  if (LEVEL === "normal") return chooseHeuristic(s, side, rng);
  try { return searchAction(s, side, rng); } catch { return chooseHeuristic(s, side, rng); }
}

/** Escolhe o substituto (após desmaio ou swaping moves) olhando o confronto que ele vai enfrentar. */
export function chooseReplacement(s: BattleState, side: SideIndex): number {
  if (LEVEL === "normal") return chooseReplacementHeuristic(s, side);
  const bench: number[] = [];
  s.sides[side].team.forEach((m, i) => { if (!m.fainted && i !== s.sides[side].active) bench.push(i); });
  if (bench.length <= 1) return bench[0] ?? chooseReplacementHeuristic(s, side);

  let best = -1, bestV = -Infinity;
  for (const i of bench) {
    const rng = mulberry32(4242 + i);
    let v = 0;
    try {
      const r = s.pivot === side ? resumePivot(s, side, i, rng) : replaceFainted(s, side, i, rng);
      const cur = resolveForced(r.state, rng);
      if (cur.winner !== null) v = cur.winner === side ? 50 : -50;
      else {
        const mine = chooseHeuristic(cur, side, rng);
        const { actions } = theirCandidates(cur, side);
        const vals = actions.map((a, k) => simulate(cur, side, mine, a, 1000 + k, false)).sort((x, y) => x - y);
        const worst = vals[0] ?? 0;
        const low = vals.slice(0, 2);
        v = 0.5 * worst + 0.5 * (sum(low) / Math.max(1, low.length)); // pesa mais as piores respostas
      }
    } catch { continue; }
    if (v > bestV) { bestV = v; best = i; }
  }
  return best >= 0 ? best : chooseReplacementHeuristic(s, side);
}