import { isDamaging, specOf } from "./data";
import {
  activeMon, at, avgHits, calcDamageBetween, canDynamax, canInflict, canMega, canSwitch, canTera, canZ,
  effMove, effSpeedOf, fixedDamage, moveEffectiveness, otherSide, statusFromAilment, targetsSelf,
  toStageKey, usableMoves, weatherActive, canGigantamax
} from "./engine";
import type { Action, BattleMoveData, BattleState, Mon, Rng, SideIndex } from "./types";

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

function scoreMove(s: BattleState, side: SideIndex, index: number): number {
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

function pickGimmick(s: BattleState, side: SideIndex, moveIndex: number): Pick<Extract<Action, { kind: "move" }>, "gimmick" | "teraType" | "gmax"> {
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

export function chooseAction(s: BattleState, side: SideIndex, rng: Rng): Action {
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
export function chooseReplacement(s: BattleState, side: SideIndex): number {
  let bestIndex = -1, bestValue = -Infinity;
  s.sides[side].team.forEach((m, i) => {
    if (m.fainted || i === s.sides[side].active) return;
    const v = matchup(s, side, m);
    if (v > bestValue) { bestValue = v; bestIndex = i; }
  });
  if (bestIndex < 0) throw new Error("Sem Pokémon disponível para entrar");
  return bestIndex;
}