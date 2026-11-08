import { chooseReplacementHeuristic, equilibriumCols, getBotLevel, pickGimmick, scoreMove } from "./ai";
import { DANCE, isDamaging, specOf } from "./data";
import {
  activateGimmick, announceFaint, at, calcDamageBetween, canDynamax, canGigantamax, canMega, canSwitch,
  canTera, canZ, changeStage, chosenMove, createBattle, doSwitch, effSpeedOf, endOfTurn, entryAbility,
  executeMove, heal, hurt, monName, movePriority, otherSide, pretty, runAttack, runStatus, syncForms, usableMoves, checkBooster, callMove,
} from "./engine";
import type { Action, BattleMonData, BattleMoveData, BattleState, Gimmick, Mon, MoveAction, Rng, SideIndex } from "./types";

export type Slot = 0 | 1;
export const SLOTS = [0, 1] as const;
export interface TargetRef { side: SideIndex; slot: Slot }
export type DAction =
  | { kind: "move"; index: number; target?: TargetRef; gimmick?: Gimmick; teraType?: string; gmax?: boolean }
  | { kind: "switch"; to: number };
type DMove = Extract<DAction, { kind: "move" }>;
type Stat = Parameters<typeof changeStage>[2];

export const key = (side: SideIndex, slot: Slot): number => side * 2 + slot;
const toMove = (a: DMove): MoveAction => ({ kind: "move", index: a.index, gimmick: a.gimmick, teraType: a.teraType, gmax: a.gmax });

// ---------- acesso às vagas ----------
export const slotIdx = (s: BattleState, side: SideIndex, slot: Slot): number => s.sides[side].slots?.[slot] ?? -1;
export function monAt(s: BattleState, side: SideIndex, slot: Slot): Mon | null {
  const i = slotIdx(s, side, slot);
  return i >= 0 ? (s.sides[side].team[i] ?? null) : null;
}
export const alive = (s: BattleState, side: SideIndex, slot: Slot): boolean => {
  const m = monAt(s, side, slot);
  return !!m && !m.fainted && !m.flags.commanding;
};
export function benchIdxs(s: BattleState, side: SideIndex): number[] {
  const st = s.sides[side];
  const inField: number[] = st.slots ?? [];
  return st.team.map((_, i) => i).filter((i) => !st.team[i]!.fainted && !inField.includes(i));
}
function firstFoeIdx(s: BattleState, side: SideIndex): number {
  const f = otherSide(side);
  for (const sl of SLOTS) if (alive(s, f, sl)) return slotIdx(s, f, sl);
  return Math.max(slotIdx(s, f, 0), slotIdx(s, f, 1), 0);
}

/** Projeta (a) contra (b): o motor 1×1 enxerga só esses dois. */
function withProj<T>(s: BattleState, a: SideIndex, ia: number, b: SideIndex, ib: number, fn: () => T): T {
  const oa = s.sides[a].active, ob = s.sides[b].active;
  s.sides[a].active = ia;
  s.sides[b].active = ib;
  try { return fn(); } finally { s.sides[a].active = oa; s.sides[b].active = ob; }
}
/** Projeta a vaga `slot` dos dois lados (fim de turno). */
function onSlot<T>(s: BattleState, slot: Slot, fn: () => T): T {
  const pick = (side: SideIndex): number => {
    const i = slotIdx(s, side, slot);
    if (i >= 0) return i;
    const f = s.sides[side].team.findIndex((m) => m.fainted);
    return f >= 0 ? f : 0;
  };
  const o0 = s.sides[0].active, o1 = s.sides[1].active;
  s.sides[0].active = pick(0);
  s.sides[1].active = pick(1);
  try { return fn(); } finally { s.sides[0].active = o0; s.sides[1].active = o1; }
}

// ---------- alvos ----------
export type TargetKind = "single" | "ally" | "foes" | "others" | "team" | "self" | "field";
export function targetKind(mv: BattleMoveData): TargetKind {
  switch (mv.target) {
    case "selected-pokemon": case "random-opponent": case "specific-move": case "selected-pokemon-me-first": return "single";
    case "ally": return "ally";
    case "all-opponents": return "foes";
    case "all-other-pokemon": return "others";
    case "all-allies": case "user-and-allies": return "team";
    case "user": case "user-or-ally": return "self";
    default: return "field";
  }
}
/** Alvos que o jogador precisa escolher (vazio = automático). */
export function targetOptions(s: BattleState, side: SideIndex, slot: Slot, mv: BattleMoveData): TargetRef[] {
  const kind = targetKind(mv);
  const fs = otherSide(side);
  const foes = SLOTS.filter((f) => alive(s, fs, f)).map((f) => ({ side: fs, slot: f }));
  const as = (1 - slot) as Slot;
  const ally = alive(s, side, as) ? [{ side, slot: as }] : [];
  if (kind === "single") return [...foes, ...ally];
  if (kind === "ally") return ally;
  return [];
}

export function legalDoubles(s: BattleState, side: SideIndex, slot: Slot): DAction[] {
  const me = monAt(s, side, slot);
  if (!me || me.fainted) return [];
  const uIdx = slotIdx(s, side, slot);
  const out: DAction[] = [];
  const usable = me.v.recharge ? [] : usableMoves(me);
  if (usable.length === 0) out.push({ kind: "move", index: -1 });
  for (const i of usable) {
    const mv = at(me.data.moves, i);
    const kind = targetKind(mv);
    if (kind === "single" || kind === "ally") for (const t of targetOptions(s, side, slot, mv)) out.push({ kind: "move", index: i, target: t });
    else out.push({ kind: "move", index: i });
  }
  const bench = benchIdxs(s, side);
  if (bench.length && !me.v.recharge && withProj(s, side, uIdx, otherSide(side), firstFoeIdx(s, side), () => canSwitch(s, side)))
    for (const to of bench) out.push({ kind: "switch", to });
  return out;
}

export function gimmickInfo(s: BattleState, side: SideIndex, slot: Slot, moveIndex: number) {
  return withProj(s, side, slotIdx(s, side, slot), otherSide(side), firstFoeIdx(s, side), () => ({
    mega: canMega(s, side), tera: canTera(s, side), dynamax: canDynamax(s, side),
    gmax: canGigantamax(s, side), z: canZ(s, side, moveIndex),
  }));
}

// ---------- criação e entrada em campo ----------
const NO_INTIMIDATE = new Set(["clear-body", "hyper-cutter", "white-smoke", "full-metal-body", "inner-focus", "oblivious", "own-tempo", "scrappy"]);

function intimidateTo(s: BattleState, user: Mon, foe: Mon | null, log: string[]): void {
  if (!foe || foe.fainted || user.ability !== "intimidate") return;
  if (foe.ability === "guard-dog") { changeStage(s, foe, "atk" as Stat, 1, log, null); return; }
  if (NO_INTIMIDATE.has(foe.ability ?? "")) return;
  log.push(`${monName(user)} intimidou ${monName(foe)}!`);
  changeStage(s, foe, "atk" as Stat, -1, log, user);
  if (foe.ability === "rattled") changeStage(s, foe, "spe" as Stat, 1, log, null);
}

/** Efeitos de entrada que dependem de dupla (o 1º adversário já foi tratado pelo motor). */
function entryExtras(s: BattleState, side: SideIndex, slot: Slot, log: string[]): void {
  const me = monAt(s, side, slot);
  if (!me || me.fainted) return;
  const fs = otherSide(side);
  const foes = SLOTS.filter((f) => alive(s, fs, f));
  if (foes[1] !== undefined) intimidateTo(s, me, monAt(s, fs, foes[1]), log);
  const ally = monAt(s, side, (1 - slot) as Slot);
  if (!ally || ally.fainted) return;
  if (me.ability === "hospitality") { heal(ally, ally.maxHp / 4); log.push(`${monName(me)} serviu um lanche a ${monName(ally)}!`); }
  if (me.ability === "costar") { me.stages = { ...ally.stages }; log.push(`${monName(me)} copiou as mudanças de ${monName(ally)}!`); }
  if (me.ability === "curious-medicine") {
    for (const k of Object.keys(ally.stages)) (ally.stages as Record<string, number>)[k] = 0;
    log.push(`As mudanças de ${monName(ally)} foram zeradas!`);
  }
  tryCommander(s, side, log);
}

const COPY_BANNED = new Set([
  "receiver", "power-of-alchemy", "trace", "wonder-guard", "forecast", "flower-gift", "multitype", "illusion",
  "imposter", "disguise", "stance-change", "zen-mode", "schooling", "battle-bond", "power-construct",
  "rks-system", "commander", "neutralizing-gas", "ice-face", "hunger-switch", "gulp-missile", "zero-to-hero",
  "tera-shift", "as-one-glastrier", "as-one-spectrier",
]);

/** Veils do aliado: viram marcas temporárias no alvo (lidas por blocksStatus, blocksDrop e Aroma Veil). */
function setVeils(s: BattleState, t: TargetRef, on: boolean): void {
  const tm = monAt(s, t.side, t.slot);
  if (!tm) return;
  const ta = monAt(s, t.side, (1 - t.slot) as Slot);
  const ab = ta && !ta.fainted ? ta.ability : null;
  tm.flags.vAromaVeil = on && ab === "aroma-veil";
  tm.flags.vSweetVeil = on && ab === "sweet-veil";
  tm.flags.vPastelVeil = on && ab === "pastel-veil";
  tm.flags.vFlowerVeil = on && ab === "flower-veil";
}

/** Cloud Nine e Air Lock valem para o campo todo, nas duas vagas. */
function refreshWeather(s: BattleState): void {
  s.weatherOff = ([0, 1] as const).some((sd) => SLOTS.some((sl) => {
    const m = monAt(s, sd, sl);
    return !!m && !m.fainted && (m.ability === "cloud-nine" || m.ability === "air-lock");
  }));
}

/** Tatsugiri com Commander entra na boca do Dondozo aliado: +2 em tudo e fica fora de combate. */
function tryCommander(s: BattleState, side: SideIndex, log: string[]): void {
  for (const slot of SLOTS) {
    const m = monAt(s, side, slot), a = monAt(s, side, (1 - slot) as Slot);
    if (!m || !a || m.fainted || a.fainted || m.flags.commanding) continue;
    if (m.ability === "commander" && m.species.startsWith("tatsugiri") && a.species.startsWith("dondozo")) {
      m.flags.commanding = true;
      a.flags.commanded = true;
      for (const k of ["atk", "def", "spa", "spd", "spe"] as const) changeStage(s, a, k, 2, log, null);
      log.push(`${monName(m)} entrou na boca de ${monName(a)}!`);
    }
  }
}

/** Receiver, Power of Alchemy, Symbiosis e o fim do Commander. Roda depois de cada ação. */
function allyAbilities(s: BattleState, log: string[]): void {
  for (const side of [0, 1] as const) for (const slot of SLOTS) {
    const m = monAt(s, side, slot), a = monAt(s, side, (1 - slot) as Slot);
    if (!m || m.fainted || !a) continue;
    if ((m.ability === "receiver" || m.ability === "power-of-alchemy") && a.fainted && a.ability && !a.flags.copied && !COPY_BANNED.has(a.ability)) {
      a.flags.copied = true;
      log.push(`${monName(m)} recebeu a habilidade ${pretty(a.ability)} de ${monName(a)}!`);
      m.ability = a.ability;
    }
    if (m.ability === "symbiosis" && !a.fainted && !a.item && a.v.lastItem && m.item) {
      a.item = m.item; m.item = null; a.v.lastItem = null;
      log.push(`${monName(m)} passou ${pretty(a.item)} para ${monName(a)}!`);
    }
    if (m.flags.commanding && (a.fainted || !a.flags.commanded)) {
      m.flags.commanding = false;
      log.push(`${monName(m)} saiu da boca do aliado!`);
    }
  }
}

export function createDoublesBattle(teams: [BattleMonData[], BattleMonData[]]): { state: BattleState; log: string[] } {
  const { state: s, log } = createBattle(teams);
  s.doubles = true;
  s.dside = { wide: [false, false], quick: [false, false] };
  s.dpend = [false, false, false, false];
  for (const side of [0, 1] as const) {
    const st = s.sides[side];
    st.slots = [0, st.team.length > 1 ? 1 : -1];
    if (st.slots[1] >= 0) log.push(`${side === 0 ? "Você" : "O bot"} enviou ${monName(at(st.team, 1))}!`);
  }
  for (const side of [0, 1] as const) {
    const idx = slotIdx(s, side, 1);
    if (idx < 0) continue;
    withProj(s, side, idx, otherSide(side), slotIdx(s, otherSide(side), 0), () => entryAbility(s, side, Math.random, log));
  }
  for (const side of [0, 1] as const) for (const slot of SLOTS) entryExtras(s, side, slot, log);
  for (const side of [0, 1] as const) for (const slot of SLOTS) {
    const m = monAt(s, side, slot);
    if (m) checkBooster(s, m, log);
  }
  return { state: s, log };
}

// ---------- trocas e substituições ----------
function switchSlot(s: BattleState, side: SideIndex, slot: Slot, to: number, rng: Rng, log: string[]): void {
  const old = slotIdx(s, side, slot);
  if (old < 0) return;
  withProj(s, side, old, otherSide(side), firstFoeIdx(s, side), () => {
    doSwitch(s, side, to, rng, log);
    s.sides[side].slots![slot] = to;
  });
  entryExtras(s, side, slot, log);
}

function pickReplacement(s: BattleState, side: SideIndex, slot: Slot): number {
  const bench = benchIdxs(s, side);
  if (bench.length === 0) return -1;
  const allyIdx = slotIdx(s, side, (1 - slot) as Slot);
  const ally = allyIdx >= 0 ? s.sides[side].team[allyIdx] : undefined;
  const was = ally?.fainted ?? true;
  if (ally) ally.fainted = true; // evita escolher o aliado que já está em campo
  try {
    return withProj(s, side, Math.max(slotIdx(s, side, slot), 0), otherSide(side), firstFoeIdx(s, side), () => chooseReplacementHeuristic(s, side));
  } catch { return bench[0]!; } finally { if (ally) ally.fainted = was; }
}

function markPending(s: BattleState): void {
  s.dpend = [false, false, false, false];
  if (s.winner !== null) return;
  for (const side of [0, 1] as const) {
    let left = benchIdxs(s, side).length;
    for (const slot of SLOTS) {
      const m = monAt(s, side, slot);
      if ((!m || m.fainted) && left > 0) { s.dpend[key(side, slot)] = true; left--; }
    }
  }
}

export function replaceSlot(prev: BattleState, side: SideIndex, slot: Slot, to: number, rng: Rng): { state: BattleState; log: string[] } {
  const s = structuredClone(prev);
  const log: string[] = [];
  switchSlot(s, side, slot, to, rng, log);
  s.dpend![key(side, slot)] = false;
  return { state: s, log };
}

function settleSides(s: BattleState, rng: Rng, log: string[], sides: SideIndex[]): void {
  for (const sd of sides) for (const slot of SLOTS) {
    if (!s.dpend?.[key(sd, slot)]) continue;
    const to = pickReplacement(s, sd, slot);
    if (to >= 0) switchSlot(s, sd, slot, to, rng, log);
    s.dpend[key(sd, slot)] = false;
  }
}
/** Substitui sozinho as vagas pendentes do bot (lado 1). */
export function settleDoubles(s: BattleState, rng: Rng, log: string[]): void { settleSides(s, rng, log, [1]); }

// ---------- golpes exclusivos de duplas ----------
const NATIVE = new Set(["helping-hand", "follow-me", "rage-powder", "wide-guard", "quick-guard", "ally-switch", "coaching", "heal-pulse", "life-dew", "aromatic-mist"]);

function blocked(u: Mon, rng: Rng, log: string[]): boolean {
  if (u.v.flinch) { log.push(`${monName(u)} se encolheu e não conseguiu agir!`); return true; }
  if (u.status === "slp" || u.status === "frz") { log.push(`${monName(u)} não consegue agir.`); return true; }
  if (u.status === "par" && rng() < 0.25) { log.push(`${monName(u)} está paralisado e não consegue agir!`); return true; }
  return false;
}

function nativeMove(s: BattleState, side: SideIndex, slot: Slot, mv: BattleMoveData, idx: number, target: TargetRef | undefined, acted: Set<number>, rng: Rng, log: string[]): void {
  const user = monAt(s, side, slot)!;
  if (idx >= 0) user.ppLeft[idx] = (user.ppLeft[idx] ?? 1) - 1;
  if (blocked(user, rng, log)) return;
  log.push(`${monName(user)} usou ${pretty(mv.name)}!`);
  user.v.lastMove = mv.name;
  user.v.lastIndex = idx;
  s.lastMoveUsed = mv.name;
  const as = (1 - slot) as Slot;
  const ally = monAt(s, side, as);
  const ok = !!ally && !ally.fainted;
  const fail = () => log.push("Mas falhou!");
  switch (mv.name) {
    case "helping-hand":
      if (ok && !acted.has(key(side, as))) { ally!.flags.hh = true; log.push(`${monName(user)} vai ajudar ${monName(ally!)}!`); } else fail();
      break;
    case "follow-me": user.flags.follow = true; log.push(`${monName(user)} chamou a atenção!`); break;
    case "rage-powder": user.flags.rage = true; log.push(`${monName(user)} espalhou um pó de fúria!`); break;
    case "wide-guard": s.dside!.wide[side] = true; log.push("Wide Guard protege o lado de golpes em área!"); break;
    case "quick-guard": s.dside!.quick[side] = true; log.push("Quick Guard protege o lado de golpes prioritários!"); break;
    case "ally-switch":
      if (ok) { const st = s.sides[side]; st.slots = [st.slots![1], st.slots![0]]; log.push(`${monName(user)} trocou de lugar com ${monName(ally!)}!`); } else fail();
      break;
    case "coaching":
      if (ok) { changeStage(s, ally!, "atk" as Stat, 1, log, user); changeStage(s, ally!, "def" as Stat, 1, log, user); } else fail();
      break;
    case "aromatic-mist": if (ok) changeStage(s, ally!, "spd" as Stat, 1, log, user); else fail(); break;
    case "life-dew":
      heal(user, user.maxHp / 4);
      if (ok) heal(ally!, ally!.maxHp / 4);
      log.push("Os aliados recuperaram HP!");
      break;
    case "heal-pulse": {
      const t = target ? monAt(s, target.side, target.slot) : ally;
      if (t && !t.fainted) { heal(t, t.maxHp / 2); log.push(`${monName(t)} recuperou HP!`); } else fail();
      break;
    }
  }
}

// ---------- redirecionamento ----------
function redirect(s: BattleState, side: SideIndex, slot: Slot, mv: BattleMoveData, t: TargetRef, foes: TargetRef[]): TargetRef {
  const user = monAt(s, side, slot)!;
  if (user.ability === "stalwart" || user.ability === "propeller-tail") return t;
  const fm = foes.find((f) => {
    const m = monAt(s, f.side, f.slot)!;
    return m.flags.follow || (m.flags.rage && user.ability !== "overcoat");
  });
  if (fm) return fm;
  for (const sd of [0, 1] as const) for (const sl of SLOTS) {
    if (sd === side && sl === slot) continue;
    const m = monAt(s, sd, sl);
    if (!m || m.fainted) continue;
    if ((m.ability === "lightning-rod" && mv.type === "electric") || (m.ability === "storm-drain" && mv.type === "water")) return { side: sd, slot: sl };
  }
  return t;
}

function pickTargets(s: BattleState, side: SideIndex, slot: Slot, mv: BattleMoveData, chosen?: TargetRef): TargetRef[] {
  const fs = otherSide(side);
  const foes: TargetRef[] = SLOTS.filter((f) => alive(s, fs, f)).map((f) => ({ side: fs, slot: f }));
  const as = (1 - slot) as Slot;
  const ally: TargetRef | null = alive(s, side, as) ? { side, slot: as } : null;
  switch (targetKind(mv)) {
    case "foes": return foes;
    case "others": return ally ? [...foes, ally] : foes;
    case "ally": return ally ? [ally] : [];
    case "single": {
      let t: TargetRef | undefined = chosen ?? foes[0];
      if (t && !alive(s, t.side, t.slot)) t = t.side === fs ? foes[0] : undefined; // alvo já caiu
      if (!t) return [];
      return [t.side === fs ? redirect(s, side, slot, mv, t, foes) : t];
    }
    default: return foes[0] ? [foes[0]] : [];
  }
}

// ---------- modificadores de dupla ----------
function dmods(s: BattleState, side: SideIndex, slot: Slot, t: TargetRef, mv: BattleMoveData, spread: boolean) {
  let power = 1, final = 1;
  const user = monAt(s, side, slot)!;
  const ally = monAt(s, side, (1 - slot) as Slot);
  const special = mv.damage_class === "special";
  if (user.flags.hh) power *= 1.5;
  if (ally && !ally.fainted) {
    if (ally.ability === "battery" && special) power *= 1.3;
    if (ally.ability === "power-spot") power *= 1.3;
    if (ally.ability === "steely-spirit" && mv.type === "steel") power *= 1.5;
    const pm = (a: string | null) => a === "plus" || a === "minus";
    if (special && pm(user.ability) && pm(ally.ability)) power *= 1.5;
  }
  if (spread && isDamaging(mv)) final *= 0.75;
  const ta = monAt(s, t.side, (1 - t.slot) as Slot);
  if (ta && !ta.fainted && ta.ability === "friend-guard") final *= 0.75;
  return { power, final };
}

const ABSORB: Record<string, { type: string; heal?: boolean; boost?: [string, number] }> = {
  "volt-absorb": { type: "electric", heal: true }, "water-absorb": { type: "water", heal: true }, "dry-skin": { type: "water", heal: true },
  "lightning-rod": { type: "electric", boost: ["spa", 1] }, "motor-drive": { type: "electric", boost: ["spe", 1] },
  "storm-drain": { type: "water", boost: ["spa", 1] }, "sap-sipper": { type: "grass", boost: ["atk", 1] },
};

/** Golpe que acerta o aliado (Earthquake, Surf, Discharge…): só dano. */
function allyHit(s: BattleState, side: SideIndex, user: Mon, t: TargetRef, mv: BattleMoveData, rng: Rng, log: string[]): void {
  const ally = monAt(s, t.side, t.slot);
  if (!ally || ally.fainted || !isDamaging(mv)) return;
  if (ally.ability === "telepathy") { log.push(`${monName(ally)} percebeu o ataque do aliado e se esquivou!`); return; }
  const ab = ABSORB[ally.ability ?? ""];
  if (ab && ab.type === mv.type) {
    if (ab.heal) heal(ally, ally.maxHp / 4);
    if (ab.boost) changeStage(s, ally, ab.boost[0] as Stat, ab.boost[1], log, null);
    log.push(`${monName(ally)} absorveu o golpe do aliado!`);
    return;
  }
  const r = calcDamageBetween(s, user, side, ally, t.side, mv);
  if (r.max <= 0) { log.push(`Não afeta ${monName(ally)}...`); return; }
  const res = hurt(ally, r.min + Math.floor(rng() * (r.max - r.min + 1)));
  log.push(`${monName(ally)} foi atingido pelo aliado (${Math.round((res.dealt / ally.maxHp) * 100)}% do HP)!`);
  if (res.fainted) announceFaint(s, t.side, ally, log);
}

// ---------- execução de um golpe ----------
function ctxFor(s: BattleState, acts: (DAction | null)[], side: SideIndex, t: TargetRef, ma: MoveAction): void {
  const ta = acts[key(t.side, t.slot)];
  const other: Action = ta && ta.kind === "move" ? toMove(ta) : { kind: "switch", to: 0 };
  s.ctx = { actions: side === 0 ? [ma, other] : [other, ma], queue: [] };
}

// ---------- fim de turno ----------
function endTurnDoubles(s: BattleState, rng: Rng, log: string[]): void {
  const run = (slot: Slot, skipField: boolean) =>
    onSlot(s, slot, () => {
      s.skipField = skipField;
      try { endOfTurn(s, rng, log); } finally { s.skipField = false; }
    });
  run(1, true);                       // 1º: efeitos por Pokémon da vaga 2
  if (s.winner === null) run(0, false); // 2º: vaga 1 + campo (clima, telas, etc.) uma única vez
  if (s.winner === null) onSlot(s, 1, () => syncForms(s, log));
  for (const side of [0, 1] as const) for (const slot of SLOTS) {
    const m = monAt(s, side, slot), a = monAt(s, side, (1 - slot) as Slot);
    if (m && !m.fainted && m.ability === "healer" && a && !a.fainted && a.status && rng() < 0.3) {
      a.status = null;
      log.push(`${monName(m)} curou o status de ${monName(a)}!`);
    }
  }
}

function finishPivot(s: BattleState, side: SideIndex, slot: Slot, to: number, rng: Rng, log: string[]): void {
  const baton = s.baton, sub = s.passSub;
  s.baton = null; s.passSub = 0;
  if (to < 0) return;
  switchSlot(s, side, slot, to, rng, log);
  const m = monAt(s, side, slot);
  if (m && baton) m.stages = baton;
  if (m && sub > 0) m.v.substitute = sub;
}

function resolveMove(s: BattleState, side: SideIndex, slot: Slot, act: DMove, acts: (DAction | null)[], acted: Set<number>, rng: Rng, log: string[], autoPivot: boolean): void {
  const user = monAt(s, side, slot);
  if (!user || user.fainted || user.flags.commanding) return;
  const uIdx = slotIdx(s, side, slot);
  const ma = toMove(act);
  const mv = withProj(s, side, uIdx, otherSide(side), firstFoeIdx(s, side), () => chosenMove(s, side, ma));
  const spec = specOf(mv);
  const kind = targetKind(mv);

  if (NATIVE.has(mv.name)) { nativeMove(s, side, slot, mv, act.index, act.target, acted, rng, log); user.flags.hh = false; return; }

  const targets = pickTargets(s, side, slot, mv, act.target);
  if (targets.length === 0) return;
  const spread = (kind === "foes" || kind === "others") && targets.length > 1;
  let used = false, first = true;

  for (const t of targets) {
    if (s.winner !== null) break;
    if (!first && !used) break;
    const tm = monAt(s, t.side, t.slot);
    if (!tm) continue;
    if (tm.fainted && kind !== "self" && kind !== "field") continue;
    if (t.side !== side) {
      if (spread && s.dside?.wide[t.side]) { log.push("Wide Guard protegeu o lado adversário!"); continue; }
      if (mv.priority > 0 && s.dside?.quick[t.side]) { log.push("Quick Guard protegeu o lado adversário!"); continue; }
    }
    s.mods = dmods(s, side, slot, t, mv, spread);
    s.moved = [false, false];
    if (acted.has(key(t.side, t.slot))) s.moved[t.side] = true;

    if (t.side === side) {                       // aliado como alvo
      if (first) {
        if (act.index >= 0) user.ppLeft[act.index] = (user.ppLeft[act.index] ?? 1) - 1;
        if (blocked(user, rng, log)) break;
        log.push(`${monName(user)} usou ${pretty(mv.name)}!`);
        used = true;
      }
      allyHit(s, side, user, t, mv, rng, log);
      first = false;
      continue;
    }
    withProj(s, side, uIdx, t.side, slotIdx(s, t.side, t.slot), () => {
      setVeils(s, t, true);
      ctxFor(s, acts, side, t, ma);
      if (first) {
        s.dblUsed = false;
        s.deferKo = spread && !!spec.selfKo;
        executeMove(s, side, ma, rng, log);
        used = !!s.dblUsed && user.v.charging === null;
      } else if (isDamaging(mv)) runAttack(s, side, user, mv, spec, false, rng, log);
      else runStatus(s, side, user, mv, spec, false, rng, log);
      setVeils(s, t, false);
      syncForms(s, log);
    });
    first = false;
  }

  if (spread && spec.selfKo && used && !user.fainted) {
    if (spec.healingWish) s.sides[side].healingWish = true;
    hurt(user, user.hp);
    announceFaint(s, side, user, log);
  }
  s.deferKo = false;
  s.mods = undefined;
  s.ctx = null;
  user.flags.hh = false;

  if (used && DANCE.has(mv.name) && s.winner === null) {   // Dancer do aliado e do 2º adversário
    const handled = targets[0];
    for (const sd of [0, 1] as const) for (const sl of SLOTS) {
      if (sd === side && sl === slot) continue;
      if (handled && handled.side === sd && handled.slot === sl) continue;   // o motor já cuidou do alvo
      const d = monAt(s, sd, sl);
      if (!d || d.fainted || d.ability !== "dancer") continue;
      const fs = otherSide(sd);
      const tgt = SLOTS.find((f) => alive(s, fs, f));
      if (tgt === undefined) continue;
      withProj(s, sd, slotIdx(s, sd, sl), fs, slotIdx(s, fs, tgt), () => { callMove(s, sd, mv, rng, log, 1); });
    }
  }

  if (s.pivot !== null) {                         // U-turn, Volt Switch, Baton Pass...
    const pSide = s.pivot;
    s.pivot = null;
    if (benchIdxs(s, pSide).length > 0 && s.winner === null) {
      if (pSide === 0 && !autoPivot) { s.dpivot = { side: pSide, slot }; return; }   // espera o jogador
      finishPivot(s, pSide, slot, pickReplacement(s, pSide, slot), rng, log);
    } else { s.baton = null; s.passSub = 0; }
  }
}

function runTurnQueue(s: BattleState, rng: Rng, log: string[], autoPivot: boolean): { state: BattleState; log: string[] } {
  const t = s.dturn!;
  const acted = new Set<number>(t.acted);
  while (t.queue.length > 0) {
    if (s.winner !== null) break;
    const x = t.queue.shift()!;
    refreshWeather(s);
    if (!alive(s, x.side, x.slot)) continue;
    const act = t.acts[key(x.side, x.slot)] as DMove;
    resolveMove(s, x.side, x.slot, act, t.acts, acted, rng, log, autoPivot);
    acted.add(key(x.side, x.slot));
    t.acted = [...acted];
    allyAbilities(s, log);
    if (s.dpivot) return { state: s, log };       // turno pausado
  }
  s.dturn = undefined;
  refreshWeather(s);
  if (s.winner === null) endTurnDoubles(s, rng, log);
  allyAbilities(s, log);
  markPending(s);
  return { state: s, log };
}

export function playTurnDoubles(prev: BattleState, acts: (DAction | null)[], rng: Rng, autoPivot = false): { state: BattleState; log: string[] } {
  const s = structuredClone(prev);
  const log: string[] = [];
  s.turn++;
  s.lastWasSwitch = [false, false];
  s.moved = [false, false];
  s.dside = { wide: [false, false], quick: [false, false] };
  s.dpivot = null;
  for (const side of [0, 1] as const) for (const slot of SLOTS) {
    const m = monAt(s, side, slot);
    if (!m) continue;
    m.v.protect = null; m.v.endure = false;
    m.flags.hh = false; m.flags.follow = false; m.flags.rage = false;
    m.flags.justIn = false; m.flags.custap = false;
  }
  log.push(`— Turno ${s.turn} —`);

  const actors: { side: SideIndex; slot: Slot; act: DAction }[] = [];
  for (const side of [0, 1] as const) for (const slot of SLOTS) {
    const a = acts[key(side, slot)];
    if (a && alive(s, side, slot)) actors.push({ side, slot, act: a });
  }
  for (const x of actors) {
    if (x.act.kind !== "move" || !x.act.gimmick || x.act.gimmick === "z") continue;
    const a = x.act;
    withProj(s, x.side, slotIdx(s, x.side, x.slot), otherSide(x.side), firstFoeIdx(s, x.side), () => activateGimmick(s, x.side, toMove(a), log));
  }
  for (const x of actors) {
    if (x.act.kind !== "switch") continue;
    switchSlot(s, x.side, x.slot, x.act.to, rng, log);
    s.lastWasSwitch[x.side] = true;
  }

  const movers = actors.filter((x) => x.act.kind === "move");
  const pri = new Map<number, number>(), spd = new Map<number, number>(), tie = new Map<number, number>();
  for (const x of movers) {
    const k = key(x.side, x.slot), a = x.act as DMove;
    withProj(s, x.side, slotIdx(s, x.side, x.slot), otherSide(x.side), firstFoeIdx(s, x.side), () => {
      pri.set(k, movePriority(s, x.side, toMove(a), rng));
      spd.set(k, effSpeedOf(s, monAt(s, x.side, x.slot)!, x.side));
    });
    tie.set(k, rng());
  }
  const tr = s.field.trickRoom > 0 ? -1 : 1;
  movers.sort((p, q) => {
    const kp = key(p.side, p.slot), kq = key(q.side, q.slot);
    return (pri.get(kq)! - pri.get(kp)!) || (tr * (spd.get(kq)! - spd.get(kp)!)) || (tie.get(kp)! - tie.get(kq)!);
  });

  s.dturn = { acts, queue: movers.map((x) => ({ side: x.side, slot: x.slot })), acted: [] };
  return runTurnQueue(s, rng, log, autoPivot);
}

/** O jogador escolheu quem entra depois do golpe de pivô: continua o turno. */
export function resumeDoublesPivot(prev: BattleState, to: number, rng: Rng): { state: BattleState; log: string[] } {
  const s = structuredClone(prev);
  const log: string[] = [];
  const p = s.dpivot;
  if (!p || !s.dturn) return { state: s, log };
  s.dpivot = null;
  finishPivot(s, p.side, p.slot, to, rng, log);
  return runTurnQueue(s, rng, log, false);
}


// ---------- IA do bot (heurística; sem busca por simulação) ----------
function allyScore(s: BattleState, side: SideIndex, slot: Slot, mv: BattleMoveData, t?: TargetRef): number {
  const ally = monAt(s, side, (1 - slot) as Slot);
  if (!ally || ally.fainted) return -100;
  switch (mv.name) {
    case "helping-hand": return 22;
    case "coaching": return 20;
    case "aromatic-mist": return 8;
    case "follow-me": case "rage-powder": return 24;
    case "wide-guard": case "quick-guard": return 6;
    case "life-dew": return ((1 - ally.hp / ally.maxHp) + (1 - (monAt(s, side, slot)!.hp / monAt(s, side, slot)!.maxHp))) * 30 - 8;
    case "heal-pulse": return t && t.side === side && ally.hp < ally.maxHp * 0.5 ? 45 : -60;
    case "ally-switch": return -20;
    default: return -200;                  // golpe de dano no aliado
  }
}

function scoreD(s: BattleState, side: SideIndex, slot: Slot, a: DMove, planned: Map<string, number>): number {
  const me = monAt(s, side, slot)!;
  if (a.index < 0) return -50;
  const mv = at(me.data.moves, a.index);
  const uIdx = slotIdx(s, side, slot);
  const fs = otherSide(side);
  const vs = (t: TargetRef) => withProj(s, side, uIdx, t.side, slotIdx(s, t.side, t.slot), () => scoreMove(s, side, a.index));
  const foes: TargetRef[] = SLOTS.filter((f) => alive(s, fs, f)).map((f) => ({ side: fs, slot: f }));
  if (NATIVE.has(mv.name)) return allyScore(s, side, slot, mv, a.target);
  const kind = targetKind(mv);
  if (kind === "single") {
    const t = a.target;
    if (!t) return -100;
    if (t.side === side) return -200;
    let sc = vs(t);
    const tm = monAt(s, t.side, t.slot)!;
    if (isDamaging(mv) && (planned.get(`${t.side}${t.slot}`) ?? 0) > 0) sc += 6;   // foco no mesmo alvo
    if (tm.hp < tm.maxHp * 0.35) sc += 8;
    return sc;
  }
  if (kind === "ally") return allyScore(s, side, slot, mv, a.target);
  if (kind === "foes" || kind === "others") {
    let sc = foes.reduce((n, t) => n + vs(t), 0) * 0.8;
    const ally = monAt(s, side, (1 - slot) as Slot);
    if (kind === "others" && ally && !ally.fainted) {
      const r = calcDamageBetween(s, me, side, ally, side, mv);
      sc -= 70 * Math.min(1, r.max / Math.max(1, ally.hp));
    }
    return sc;
  }
  return foes[0] ? vs(foes[0]) : 0;
}

export function chooseDoublesHeuristic(s: BattleState, side: SideIndex, rng: Rng): (DAction | null)[] {
  const out: (DAction | null)[] = [null, null];
  const planned = new Map<string, number>();
  for (const slot of SLOTS) {
    const me = monAt(s, side, slot);
    if (!me || me.fainted) continue;
    let best: DMove | null = null, bestScore = -Infinity;
    for (const a of legalDoubles(s, side, slot)) {
      if (a.kind !== "move") continue;
      const sc = scoreD(s, side, slot, a, planned) + rng() * 3;
      if (sc > bestScore) { bestScore = sc; best = a; }
    }
    if (!best) continue;
    const b: DMove = best;
    const g = b.index >= 0
      ? withProj(s, side, slotIdx(s, side, slot), otherSide(side), firstFoeIdx(s, side), () => pickGimmick(s, side, b.index))
      : {};
    out[slot] = { ...b, ...g } as DMove;
    if (b.target) planned.set(`${b.target.side}${b.target.slot}`, (planned.get(`${b.target.side}${b.target.slot}`) ?? 0) + 1);
  }
  return out;
}

// ---------- Difícil e Mestre: busca por simulação (Hedge) ----------
type Joint = (DAction | null)[];

function seeded(seed: number): Rng {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

/** As melhores jogadas conjuntas (golpe + alvo das duas vagas) pela heurística. */
function jointCandidates(s: BattleState, side: SideIndex, k: number): { acts: Joint; score: number }[] {
  type Opt = { act: DMove | null; sc: number };
  const per: Opt[][] = [[{ act: null, sc: 0 }], [{ act: null, sc: 0 }]];
  const gcache = new Map<string, Partial<DMove>>();
  const withGimmick = (slot: Slot, a: DMove): DMove => {
    if (a.index < 0) return a;
    const ck = `${slot}:${a.index}`;
    let g = gcache.get(ck);
    if (!g) {
      g = withProj(s, side, slotIdx(s, side, slot), otherSide(side), firstFoeIdx(s, side), () => pickGimmick(s, side, a.index)) as Partial<DMove>;
      gcache.set(ck, g);
    }
    return { ...a, ...g } as DMove;
  };
  for (const slot of SLOTS) {
    if (!alive(s, side, slot)) continue;
    const opts: Opt[] = [];
    for (const a of legalDoubles(s, side, slot)) if (a.kind === "move") opts.push({ act: a, sc: scoreD(s, side, slot, a, new Map()) });
    opts.sort((x, y) => y.sc - x.sc);
    per[slot] = opts.slice(0, 5);
  }
  const out: { acts: Joint; score: number }[] = [];
  for (const a of per[0]!) for (const b of per[1]!) {
    let score = a.sc + b.sc;
    const ta = a.act?.target, tb = b.act?.target;
    if (ta && tb && ta.side === tb.side && ta.slot === tb.slot) score += 6;   // foco no mesmo alvo
    out.push({ acts: [a.act ? withGimmick(0, a.act) : null, b.act ? withGimmick(1, b.act) : null], score });
  }
  out.sort((x, y) => y.score - x.score);
  return out.slice(0, k);
}

function evalD(s: BattleState, side: SideIndex): number {
  if (s.winner !== null) return s.winner === side ? 50 : -50;
  const val = (sd: SideIndex): number => s.sides[sd].team.reduce((n, m) => {
    if (m.fainted) return n;
    const str = (m.stats.hp + m.stats.atk + m.stats.def + m.stats.spa + m.stats.spd + m.stats.spe) / 600;
    return n + (m.hp / m.maxHp) * str * 10 + (m.stages.atk + m.stages.spa + m.stages.spe) * 0.3 - (m.status ? 1.5 : 0);
  }, 0);
  return val(side) - val(otherSide(side));
}

function simulateD(s: BattleState, side: SideIndex, mine: Joint, theirs: Joint, seed: number): BattleState {
  const acts: Joint = [null, null, null, null];
  for (const sl of SLOTS) { acts[key(side, sl)] = mine[sl] ?? null; acts[key(otherSide(side), sl)] = theirs[sl] ?? null; }
  const st = playTurnDoubles(s, acts, seeded(seed)).state;
  settleSides(st, seeded(seed + 1), [], [0, 1]);
  return st;
}

function searchDoubles(s: BattleState, side: SideIndex, rng: Rng): Joint {
  const master = getBotLevel() === "master";
  const K = master ? 7 : 5;
  const rows = jointCandidates(s, side, K);
  if (rows.length <= 1) return rows[0]?.acts ?? chooseDoublesHeuristic(s, side, rng);
  const cols = jointCandidates(s, otherSide(side), K);
  if (cols.length === 0) return rows[0]!.acts;

  const samples = master ? 3 : 2;
  const deadline = performance.now() + (master ? 4000 : 2000);
  const M = rows.map(() => cols.map(() => 0));
  const cnt = rows.map(() => cols.map(() => 0));
  const seed0 = Math.floor(rng() * 1e9);
  outer: for (let k = 0; k < samples; k++) {
    for (let i = 0; i < rows.length; i++) for (let j = 0; j < cols.length; j++) {
      if (k > 0 && performance.now() > deadline) break outer;       // a 1ª amostra sempre termina
      M[i]![j]! += evalD(simulateD(s, side, rows[i]!.acts, cols[j]!.acts, seed0 + k * 7919), side);
      cnt[i]![j]!++;
    }
  }
  for (let i = 0; i < rows.length; i++) for (let j = 0; j < cols.length; j++) M[i]![j]! /= Math.max(1, cnt[i]![j]!);

  const top = Math.max(...cols.map((c) => c.score));
  const w = cols.map((c) => Math.exp((c.score - top) / 8));
  const ws = w.reduce((a, b) => a + b, 0);
  const prior = w.map((x) => x / ws);
  const q = equilibriumCols(M);
  const mixW = master ? 0.5 : 0.35;
  let best = 0, bestV = -Infinity;
  rows.forEach((_, i) => {
    const v = cols.reduce((n, _c, j) => n + M[i]![j]! * (mixW * (q[j] ?? 0) + (1 - mixW) * (prior[j] ?? 0)), 0);
    if (v > bestV) { bestV = v; best = i; }
  });
  return rows[best]!.acts;
}

/** Normal = heurística; Difícil e Mestre = simulação do turno com o algoritmo Hedge. */
export function chooseDoubles(s: BattleState, side: SideIndex, rng: Rng): (DAction | null)[] {
  if (getBotLevel() === "normal") return chooseDoublesHeuristic(s, side, rng);
  try { return searchDoubles(s, side, rng); } catch { return chooseDoublesHeuristic(s, side, rng); }
}