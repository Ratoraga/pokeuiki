import { BOT_USERNAME } from "../shared/api";
import { GMAX_MOVES, Z_MOVE_NAMES, isDamaging, specOf } from "../shared/battle/data";
import { activeMon, calcDamageBetween, createBattle, effMove, effSpeedOf, fixedDamage, setTypeChart } from "../shared/battle/engine";
import type { BattleMonData, BattleMoveData, BattleState, StatKey5, Status, Terrain, Weather } from "../shared/battle/types";
import { applyStatModifiers } from "../shared/modifiers";
import { TYPES } from "../shared/pokemonTypes";
import { NATURES, NATURE_NAMES, STAT_KEYS, STAT_LABELS, calcStats, natureLabel, type StatBlock, type StatKey } from "../shared/stats";
import { api, errorMessage, session } from "./api";
import { koChance, residualInfo } from "./calc-core";
import { $, app, boot, esc } from "./common";
import { prettyName, typeLabel } from "./format";
import type { Item, Member, Pokemon, PokemonDetail } from "./types";

const slug = (s: string) => s.trim().toLowerCase().replace(/[.'’:]/g, "").replace(/\s+/g, "-");
const clampInt = (raw: string | number, lo: number, hi: number) => Math.max(lo, Math.min(hi, Math.floor(Number(raw) || 0)));
const BOOSTS: StatKey5[] = ["atk", "def", "spa", "spd", "spe"];
const SD_LABEL: Record<StatKey, string> = { hp: "HP", atk: "Atk", def: "Def", spa: "SpA", spd: "SpD", spe: "Spe" };
const STATUSES: [string, string][] = [["", "Saudável"], ["brn", "Queimado"], ["par", "Paralisado"], ["psn", "Envenenado"], ["tox", "Gravemente envenenado"], ["slp", "Dormindo"], ["frz", "Congelado"]];
const WEATHERS: [string, string][] = [["", "Nenhum"], ["sun", "Sol"], ["rain", "Chuva"], ["sand", "Areia"], ["snow", "Neve"], ["hail", "Granizo"], ["harsh-sun", "Sol extremo"], ["heavy-rain", "Chuva torrencial"], ["strong-winds", "Ventos fortes"]];
const TERRAINS: [string, string][] = [["", "Nenhum"], ["electric", "Elétrico"], ["grassy", "Grama"], ["misty", "Névoa"], ["psychic", "Psíquico"]];

interface MoveSlot { name: string; crit: boolean; z: boolean; hits: number }
interface Side {
  species: string; detail: PokemonDetail | null; level: number; nature: string; ability: string; item: string;
  status: string; hpPct: number; boosts: Record<StatKey5, number>; evs: StatBlock; ivs: StatBlock;
  teraOn: boolean; tera: string; dynamax: boolean; gmax: boolean; identified: boolean; moves: MoveSlot[];
}
interface SideField {
  reflect: boolean; lightScreen: boolean; auroraVeil: boolean; tailwind: boolean; helpingHand: boolean;
  friendGuard: boolean; battery: boolean; powerSpot: boolean; stealthRock: boolean; spikes: number;
}
interface FieldOpts {
  weather: string; terrain: string; gravity: boolean; magicRoom: boolean; wonderRoom: boolean; trickRoom: boolean;
  fairy: boolean; dark: boolean; abreak: boolean; tablets: boolean; vessel: boolean; sword: boolean; beads: boolean;
  side: [SideField, SideField], doubles: boolean;
}

const stats = (v: number): StatBlock => ({ hp: v, atk: v, def: v, spa: v, spd: v, spe: v });
const newSide = (species: string, moves: string[]): Side => ({
  species, detail: null, level: 50, nature: "hardy", ability: "", item: "", status: "", hpPct: 100,
  boosts: { atk: 0, def: 0, spa: 0, spd: 0, spe: 0 }, evs: stats(0), ivs: stats(31), teraOn: false, tera: "normal",
  dynamax: false, gmax: false, identified: false,
  moves: [0, 1, 2, 3].map((i) => ({ name: moves[i] ?? "", crit: false, z: false, hits: 0 })),
});
const newSideField = (): SideField => ({
  reflect: false, lightScreen: false, auroraVeil: false, tailwind: false, helpingHand: false, friendGuard: false,
  battery: false, powerSpot: false, stealthRock: false, spikes: 0,
});

let sides: [Side, Side] = [
  newSide("garchomp", ["earthquake", "dragon-claw", "stone-edge", "swords-dance"]),
  newSide("heatran", ["magma-storm", "flash-cannon", "earth-power", "toxic"]),
];
const field: FieldOpts = {
  weather: "", terrain: "", gravity: false, magicRoom: false, wonderRoom: false, trickRoom: false,
  fairy: false, dark: false, abreak: false, tablets: false, vessel: false, sword: false, beads: false,
  side: [newSideField(), newSideField()], doubles: false
};

let catalog: Pokemon[] = [];
const bySlug = new Map<string, Pokemon>();
const moves = new Map<string, BattleMoveData>();
let items: Item[] = [];
let teamSets: { label: string; member: Member }[] | null = null;

// ---------------------------------------------------------------
// Painéis
// ---------------------------------------------------------------
function panelHtml(i: 0 | 1): string {
  const sd = sides[i];
  const d = sd.detail;
  const abilities = d?.abilities ?? [];
  const abNames = [...abilities.map((a) => a.name), ...(sd.ability && !abilities.some((a) => a.name === sd.ability) ? [sd.ability] : [])];
  const row = (k: StatKey) => `<tr><td>${STAT_LABELS[k]}</td><td>${d ? d.base[k] : "—"}</td>
    <td><input type="number" min="0" max="31" value="${sd.ivs[k]}" data-s="${i}" data-iv="${k}"></td>
    <td><input type="number" min="0" max="252" value="${sd.evs[k]}" data-s="${i}" data-ev="${k}"></td>
    <td>${k === "hp" ? "—" : `<select data-s="${i}" data-boost="${k}">${Array.from({ length: 13 }, (_, n) => n - 6).map((v) => `<option value="${v}" ${sd.boosts[k as StatKey5] === v ? "selected" : ""}>${v > 0 ? `+${v}` : v}</option>`).join("")}</select>`}</td>
    <td><strong id="fin-${i}-${k}">—</strong></td></tr>`;
  const moveRow = (m: MoveSlot, n: number) => `<div class="calc-move">
    <input list="moves-list" placeholder="Golpe ${n + 1}" value="${esc(m.name ? prettyName(slug(m.name)) : "")}" data-s="${i}" data-m="${n}" data-mf="name">
    <label class="check"><input type="checkbox" ${m.crit ? "checked" : ""} data-s="${i}" data-m="${n}" data-mf="crit"> Crítico</label>
    <label class="check"><input type="checkbox" ${m.z ? "checked" : ""} data-s="${i}" data-m="${n}" data-mf="z"> Z</label>
    <select data-s="${i}" data-m="${n}" data-mf="hits"><option value="0">Acertos: auto</option>${Array.from({ length: 10 }, (_, h) => h + 1).map((h) => `<option value="${h}" ${m.hits === h ? "selected" : ""}>${h}</option>`).join("")}</select></div>`;

  return `<h3>Pokémon ${i === 0 ? "A" : "B"}</h3>
    <div class="row">
      <label>Espécie<input list="species-list" value="${esc(prettyName(sd.species))}" data-s="${i}" data-f="species"></label>
      <label>Nível<input type="number" min="1" max="100" value="${sd.level}" data-s="${i}" data-f="level"></label></div>
    <div class="row">
      <label>Natureza<select data-s="${i}" data-f="nature">${NATURE_NAMES.map((n) => `<option value="${n}" ${n === sd.nature ? "selected" : ""}>${esc(prettyName(n))} (${esc(natureLabel(n))})</option>`).join("")}</select></label>
      <label>Habilidade<select data-s="${i}" data-f="ability"><option value="">—</option>${abNames.map((a) => `<option value="${a}" ${a === sd.ability ? "selected" : ""}>${esc(prettyName(a))}</option>`).join("")}</select></label></div>
    <div class="row">
      <label>Item<input list="items-list" value="${esc(sd.item ? prettyName(slug(sd.item)) : "")}" data-s="${i}" data-f="item"></label>
      <label>Status<select data-s="${i}" data-f="status">${STATUSES.map(([v, l]) => `<option value="${v}" ${v === sd.status ? "selected" : ""}>${l}</option>`).join("")}</select></label></div>
    <label>HP atual: <span id="hpv-${i}">${sd.hpPct}%</span><input type="range" min="1" max="100" value="${sd.hpPct}" data-s="${i}" data-f="hp"></label>
    <table class="stats-table"><thead><tr><th>Status</th><th>Base</th><th>IV</th><th>EV</th><th>Boost</th><th>Final</th></tr></thead><tbody>${STAT_KEYS.map(row).join("")}</tbody></table>
    <p class="muted" id="evtot-${i}"></p>
    <div class="row">
      <label class="check"><input type="checkbox" ${sd.teraOn ? "checked" : ""} data-s="${i}" data-f="teraOn"> Tera</label>
      <select data-s="${i}" data-f="tera"><option value="stellar" ${sd.tera === "stellar" ? "selected" : ""}>Estelar</option>${TYPES.map((t) => `<option value="${t}" ${sd.tera === t ? "selected" : ""}>${esc(typeLabel(t))}</option>`).join("")}</select>
      <label class="check"><input type="checkbox" ${sd.dynamax ? "checked" : ""} data-s="${i}" data-f="dynamax"> Dynamax</label>
      ${GMAX_MOVES[sd.species] ? `<label class="check"><input type="checkbox" ${sd.gmax ? "checked" : ""} data-s="${i}" data-f="gmax"> Gigantamax</label>` : ""}
      <label class="check"><input type="checkbox" ${sd.identified ? "checked" : ""} data-s="${i}" data-f="identified"> Foresight</label></div>
    <fieldset><legend>Golpes</legend>${sd.moves.map(moveRow).join("")}</fieldset>
    <div class="actions">
      <button type="button" data-act="export" data-s="${i}">Exportar</button>
      <button type="button" data-act="import" data-s="${i}">Importar</button>
      <button type="button" data-act="load" data-s="${i}">Carregar de um time</button></div>
    <div id="io-${i}"></div>`;
}

function fieldHtml(): string {
  const sel = (k: string, opts: [string, string][], v: string) => `<select data-field="${k}">${opts.map(([val, l]) => `<option value="${val}" ${val === v ? "selected" : ""}>${l}</option>`).join("")}</select>`;
  const chk = (k: keyof FieldOpts, label: string) => `<label class="check"><input type="checkbox" data-field="${k}" ${field[k] ? "checked" : ""}> ${label}</label>`;
  const side = (i: 0 | 1) => {
    const f = field.side[i];
    const c = (k: keyof SideField, label: string) => `<label class="check"><input type="checkbox" data-fs="${i}" data-fk="${k}" ${f[k] ? "checked" : ""}> ${label}</label>`;
    return `<div><strong>Lado do Pokémon ${i === 0 ? "A" : "B"}</strong><div class="calc-checks">
      ${c("reflect", "Reflect")}${c("lightScreen", "Light Screen")}${c("auroraVeil", "Aurora Veil")}${c("tailwind", "Tailwind")}
      ${c("helpingHand", "Helping Hand")}${c("friendGuard", "Friend Guard")}${c("battery", "Battery")}${c("powerSpot", "Power Spot")}${c("stealthRock", "Stealth Rock")}
      <label>Spikes <select data-fs="${i}" data-fk="spikes">${[0, 1, 2, 3].map((n) => `<option value="${n}" ${f.spikes === n ? "selected" : ""}>${n}</option>`).join("")}</select></label></div></div>`;
  };
  return `<h3>Campo</h3>
    <div class="row"><label>Clima ${sel("weather", WEATHERS, field.weather)}</label><label>Terreno ${sel("terrain", TERRAINS, field.terrain)}</label></div>
    <div class="calc-checks">${chk("gravity", "Gravity")}${chk("doubles", "Duplas")}${chk("magicRoom", "Magic Room")}${chk("wonderRoom", "Wonder Room")}${chk("trickRoom", "Trick Room")}
      ${chk("fairy", "Fairy Aura")}${chk("dark", "Dark Aura")}${chk("abreak", "Aura Break")}
      ${chk("tablets", "Tablets of Ruin")}${chk("vessel", "Vessel of Ruin")}${chk("sword", "Sword of Ruin")}${chk("beads", "Beads of Ruin")}</div>
    <div class="row">${side(0)}${side(1)}</div>
    <div class="actions"><button type="button" data-act="swap">Trocar A ↔ B</button></div>`;
}

// ---------------------------------------------------------------
// Cálculo
// ---------------------------------------------------------------
function buildData(i: 0 | 1): BattleMonData | null {
  const sd = sides[i];
  const d = sd.detail;
  if (!d) return null;
  const ability = sd.ability || null;
  const item = field.magicRoom || ability === "klutz" ? null : slug(sd.item) || null;
  const raw = calcStats(d.base, sd.ivs, sd.evs, sd.level, sd.nature);
  const { stats: final } = applyStatModifiers(raw, { ability, item, speciesId: d.species_id, canEvolve: d.can_evolve });
  return {
    pokemon_id: d.id, species_id: d.species_id, species: d.name, nickname: null,
    types: d.type2 ? [d.type1, d.type2] : [d.type1], level: sd.level, stats: final, ability, item,
    weight: (d.weight ?? 600) / 10, sprite: null, gmax: null, forms: null, mega: null, moves: [],
  };
}

function makeState(): BattleState | null {
  const a = buildData(0), b = buildData(1);
  if (!a || !b) return null;
  const { state } = createBattle([[a], [b]]);
  const f = state.field;
  f.weather = (field.weather || null) as Weather | null; f.weatherTurns = 5;
  f.terrain = (field.terrain || null) as Terrain | null; f.terrainTurns = 5;
  f.gravity = field.gravity ? 5 : 0; f.wonderRoom = field.wonderRoom ? 5 : 0; f.trickRoom = field.trickRoom ? 5 : 0;
  f.auras = { fairy: field.fairy, dark: field.dark, break: field.abreak };
  f.ruin = { tablets: field.tablets, vessel: field.vessel, sword: field.sword, beads: field.beads };
  for (const i of [0, 1] as const) {
    const sf = field.side[i], st = state.sides[i], sd = sides[i], m = activeMon(state, i);
    st.screens = { reflect: sf.reflect ? 5 : 0, lightScreen: sf.lightScreen ? 5 : 0, auroraVeil: sf.auroraVeil ? 5 : 0 };
    st.tailwind = sf.tailwind ? 4 : 0;
    st.hazards = { stealthRock: sf.stealthRock, spikes: sf.spikes, toxicSpikes: 0, stickyWeb: false };
    m.stages = { ...sd.boosts, acc: 0, eva: 0 };
    m.status = (sd.status || null) as Status | null;
    if (sd.dynamax) {
      m.baseMaxHp = m.maxHp; m.maxHp *= 2; m.v.dynamax = 3;
      m.flags.gmax = sd.gmax && !!GMAX_MOVES[m.data.species];
    }
    m.hp = Math.max(1, Math.round((m.maxHp * sd.hpPct) / 100));
    if (sd.teraOn) { m.tera = sd.tera; if (sd.tera !== "stellar") m.types = [sd.tera]; }
    m.v.identified = sd.identified;
  }
  return state;
}

function computeRolls(state: BattleState, a: 0 | 1, mv: BattleMoveData, slot: MoveSlot, z: boolean): { rolls: number[]; eff: number; note: string } {
  const b = (1 - a) as 0 | 1;
  const att = activeMon(state, a), def = activeMon(state, b);
  const spec = specOf(mv);
  const sf = field.side[a], df = field.side[b];
  const powerMult = (sf.helpingHand ? 1.5 : 1) * (sf.battery && mv.damage_class === "special" ? 1.3 : 1) * (sf.powerSpot ? 1.3 : 1);
  const opts = (hit: number) => ({ crit: slot.crit, hit, z, powerMult,    finalMult: (df.friendGuard ? 0.75 : 1) * (field.doubles && (mv.target === "all-opponents" || mv.target === "all-other-pokemon") ? 0.75 : 1) });
  const first = calcDamageBetween(state, att, a, def, b, mv, opts(0));
  const zeros = new Array<number>(16).fill(0);
  if (first.eff === 0) return { rolls: zeros, eff: 0, note: "não afeta" };
  if (spec.ohko) return { rolls: new Array<number>(16).fill(def.hp), eff: first.eff, note: "OHKO (depende da precisão)" };
  if (spec.fixed !== undefined) return { rolls: new Array<number>(16).fill(fixedDamage(att, def, spec.fixed, () => 0.5)), eff: first.eff, note: "dano fixo" };
  if (spec.counter) return { rolls: zeros, eff: first.eff, note: "devolve o dano recebido" };

  const lo = mv.min_hits ?? 1, hi = mv.max_hits ?? 1;
  let hits = slot.hits > 0 ? slot.hits : lo === hi ? lo : lo === 2 && hi === 5 ? (att.ability === "skill-link" ? 5 : 3) : hi;
  const pbond = att.ability === "parental-bond" && hi === 1 && !z;
  if (pbond) hits = 2;
  let total = zeros;
  for (let h = 0; h < hits; h++) {
    const r = h === 0 ? first : calcDamageBetween(state, att, a, def, b, mv, opts(h));
    total = total.map((v, n) => v + (pbond && h === 1 ? Math.floor((r.rolls[n] ?? 0) * 0.25) : (r.rolls[n] ?? 0)));
  }
  return { rolls: total, eff: first.eff, note: hits > 1 ? `${hits} acertos` : "" };
}

const evText = (sd: Side, k: StatKey) => {
  const n = NATURES[sd.nature];
  return `${sd.evs[k]}${n?.plus === k ? "+" : n?.minus === k ? "-" : ""}`;
};
const boostText = (v: number) => (v > 0 ? `+${v} ` : v < 0 ? `${v} ` : "");

function resultsFor(state: BattleState, a: 0 | 1): string {
  const b = (1 - a) as 0 | 1;
  const att = activeMon(state, a), def = activeMon(state, b);
  const sd = sides[a], sdDef = sides[b];
  const res = residualInfo(state, b);
  const hpStart = def.hp - res.chip;
  const pct = (v: number) => ((v / def.maxHp) * 100).toFixed(1);
  const rows: { html: string; max: number }[] = [];

  for (const slot of sd.moves) {
    const nm = slug(slot.name);
    if (!nm) continue;
    const base = moves.get(nm);
    if (!base) { rows.push({ html: `<p class="error">Golpe "${esc(slot.name)}" não encontrado.</p>`, max: -1 }); continue; }
    const dyn = att.v.dynamax > 0;
    const mv = dyn ? effMove(att, base) : base;
    const z = slot.z && !dyn && base.damage_class !== "status";
    const title = prettyName(z ? (Z_MOVE_NAMES[base.type] ?? base.name) : mv.name);
    if (!isDamaging(mv)) { rows.push({ html: `<div class="calc-row"><strong>${esc(title)}</strong>: golpe de status, não causa dano.</div>`, max: 0 }); continue; }

    const { rolls, eff, note } = computeRolls(state, a, mv, slot, z);
    const min = Math.min(...rolls), max = Math.max(...rolls);
    const physical = mv.damage_class === "physical";
    const spec = specOf(mv);
    const atkK: StatKey5 = physical ? "atk" : "spa";
    let defK: StatKey5 = spec.defends === "def" || physical ? "def" : "spd";
    if (field.wonderRoom) defK = defK === "def" ? "spd" : "def";
    const weather = WEATHERS.find(([v]) => v === field.weather)?.[1];
    const desc = `${boostText(sd.boosts[atkK])}${evText(sd, atkK)} ${STAT_LABELS[atkK]} ${sd.item ? `${prettyName(slug(sd.item))} ` : ""}${sd.ability ? `${prettyName(sd.ability)} ` : ""}${prettyName(sd.species)} ${title}${slot.crit ? " (crítico)" : ""} vs. ${boostText(sdDef.boosts[defK])}${evText(sdDef, "hp")} HP / ${evText(sdDef, defK)} ${STAT_LABELS[defK]} ${sdDef.item ? `${prettyName(slug(sdDef.item))} ` : ""}${sdDef.ability ? `${prettyName(sdDef.ability)} ` : ""}${prettyName(sdDef.species)}${weather && field.weather ? ` sob ${weather}` : ""}`;

    let koText = "";
    if (max <= 0) koText = eff === 0 ? "não afeta o alvo" : note || "não causa dano";
    else if (hpStart <= 0) koText = "cai antes de entrar em campo (armadilhas)";
    else {
      const ko = koChance(rolls, hpStart, res.perTurn);
      const after = res.notes.length ? ` (considerando ${res.notes.join(", ")})` : "";
      koText = !ko ? `não nocauteia em 4 golpes${after}`
        : ko.chance >= 0.9999 ? `nocaute garantido em ${ko.n === 1 ? "1 golpe" : `${ko.n} golpes`}${after}`
        : `${(ko.chance * 100).toFixed(1)}% de chance de nocaute em ${ko.n === 1 ? "1 golpe" : `${ko.n} golpes`}${after}`;
    }
    const range = max <= 0 ? "0" : `${min}-${max} (${pct(min)} – ${pct(max)}%)`;
    rows.push({
      max,
      html: `<div class="calc-row" data-max="${max}"><div><strong>${esc(desc)}:</strong> ${range}${note && max > 0 ? ` · ${esc(note)}` : ""} — ${esc(koText)}</div>
        <details><summary class="muted small">16 valores possíveis</summary><span class="small">${rolls.join(", ")}</span></details></div>`,
    });
  }
  const best = Math.max(0, ...rows.map((r) => r.max));
  return rows.map((r) => (r.max > 0 && r.max === best ? r.html.replace('class="calc-row"', 'class="calc-row best"') : r.html)).join("") || `<p class="muted">Escolha golpes para calcular.</p>`;
}

function recalc(): void {
  const box = $("#results")!;
  try {
    const state = makeState();
    if (!state) { box.innerHTML = `<p class="muted">Escolha as duas espécies para calcular.</p>`; return; }
    for (const i of [0, 1] as const) {
      const m = activeMon(state, i), d = sides[i].detail;
      for (const k of STAT_KEYS) { const el = $(`#fin-${i}-${k}`); if (el) el.textContent = String(m.data.stats[k]); }
      const total = STAT_KEYS.reduce((n, k) => n + sides[i].evs[k], 0);
      const ev = $(`#evtot-${i}`);
      if (ev) { ev.textContent = `EVs: ${total}/510${d ? ` · HP ${m.hp}/${m.maxHp}` : ""}`; ev.className = total > 510 ? "error" : "muted"; }
    }
    const sp = [effSpeedOf(state, activeMon(state, 0), 0), effSpeedOf(state, activeMon(state, 1), 1)] as const;
    const first = sp[0] === sp[1] ? "empate de velocidade" : (sp[0] > sp[1]) !== (field.trickRoom) ? `${prettyName(sides[0].species)} age primeiro` : `${prettyName(sides[1].species)} age primeiro`;
    box.innerHTML = `<h3>Resultados</h3>
      <p class="muted">Velocidade: ${prettyName(sides[0].species)} ${sp[0]} · ${prettyName(sides[1].species)} ${sp[1]} → ${esc(first)}${field.trickRoom ? " (Trick Room)" : ""}</p>
      <h4>${esc(prettyName(sides[0].species))} atacando ${esc(prettyName(sides[1].species))}</h4>${resultsFor(state, 0)}
      <h4>${esc(prettyName(sides[1].species))} atacando ${esc(prettyName(sides[0].species))}</h4>${resultsFor(state, 1)}
      <p class="muted small">O arredondamento pode diferir em ±1 de dano da calculadora do Showdown. Golpes de vários acertos somam os mesmos 16 valores em cada acerto.</p>`;
  } catch (e) {
    box.innerHTML = `<p class="error">${esc(errorMessage(e))}</p>`;
  }
}

// ---------------------------------------------------------------
// Espécie, importação e exportação
// ---------------------------------------------------------------
async function loadDetail(i: 0 | 1): Promise<void> {
  const sd = sides[i];
  const p = bySlug.get(slug(sd.species));
  if (!p) return;
  sd.detail = await api.getPokemon(p.id);
  sd.species = sd.detail.name;
  if (!sd.detail.abilities.some((a) => a.name === sd.ability)) {
    sd.ability = sd.detail.abilities.find((a) => !a.is_hidden)?.name ?? sd.detail.abilities[0]?.name ?? "";
  }
}
async function setSpecies(i: 0 | 1, value: string): Promise<void> {
  if (!bySlug.has(slug(value))) return;
  sides[i].species = slug(value);
  if (!GMAX_MOVES[sides[i].species]) sides[i].gmax = false;
  await loadDetail(i);
  drawPanel(i);
  recalc();
}
function drawPanel(i: 0 | 1): void { $(`#p${i}`)!.innerHTML = panelHtml(i); }

const sdName = (s: string) => s.split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join("-");

function exportSet(sd: Side): string {
  const evs = STAT_KEYS.filter((k) => sd.evs[k] > 0).map((k) => `${sd.evs[k]} ${SD_LABEL[k]}`).join(" / ");
  const ivs = STAT_KEYS.filter((k) => sd.ivs[k] !== 31).map((k) => `${sd.ivs[k]} ${SD_LABEL[k]}`).join(" / ");
  return [
    `${sdName(sd.species)}${sd.item ? ` @ ${prettyName(slug(sd.item))}` : ""}`,
    sd.ability ? `Ability: ${prettyName(sd.ability)}` : "", `Level: ${sd.level}`,
    sd.teraOn ? `Tera Type: ${prettyName(sd.tera)}` : "", evs ? `EVs: ${evs}` : "",
    `${prettyName(sd.nature)} Nature`, ivs ? `IVs: ${ivs}` : "",
    ...sd.moves.filter((m) => m.name.trim()).map((m) => `- ${prettyName(slug(m.name))}`),
  ].filter(Boolean).join("\n");
}

async function importSet(i: 0 | 1, text: string): Promise<void> {
  const sd = sides[i];
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  let mi = 0;
  sd.moves.forEach((m) => { m.name = ""; });
  lines.forEach((line, n) => {
    if (n === 0) {
      const [left = "", item] = line.split(" @ ");
      const paren = /\(([^)]+)\)\s*$/.exec(left);
      const name = paren && paren[1] && !/^[MF]$/.test(paren[1]) ? paren[1] : left.replace(/\s*\([MF]\)\s*$/, "");
      sd.species = slug(name);
      sd.item = item ? slug(item) : "";
    } else if (line.startsWith("Ability:")) sd.ability = slug(line.slice(8));
    else if (line.startsWith("Level:")) sd.level = clampInt(line.slice(6), 1, 100);
    else if (line.startsWith("Tera Type:")) { sd.tera = slug(line.slice(10)); sd.teraOn = true; }
    else if (line.startsWith("EVs:") || line.startsWith("IVs:")) {
      const isEv = line.startsWith("EVs");
      const target = isEv ? sd.evs : sd.ivs;
      for (const k of STAT_KEYS) target[k] = isEv ? 0 : 31;
      for (const part of line.slice(4).split("/")) {
        const [v, label] = part.trim().split(/\s+/);
        const key = STAT_KEYS.find((k) => SD_LABEL[k].toLowerCase() === (label ?? "").toLowerCase());
        if (key) target[key] = clampInt(v ?? "0", 0, isEv ? 252 : 31);
      }
    } else if (/ Nature$/.test(line)) sd.nature = slug(line.replace(/ Nature$/, ""));
    else if (line.startsWith("-") && mi < 4) { const slot = sd.moves[mi++]; if (slot) slot.name = slug(line.slice(1).replace(/\[.*\]/, "")); }
  });
  await loadDetail(i);
  drawPanel(i);
  recalc();
}

async function loadTeamSets(): Promise<void> {
  if (teamSets) return;
  const lists: { label: string; id: number }[] = [];
  try { for (const t of await api.teamsOfUser(BOT_USERNAME)) lists.push({ label: t.name, id: t.id }); } catch { /* ignora */ }
  const user = session.user;
  if (user) { try { for (const t of await api.teamsOfUser(user.username)) lists.push({ label: t.name, id: t.id }); } catch { /* ignora */ } }
  teamSets = [];
  for (const t of lists) {
    try {
      const team = await api.getTeam(t.id);
      for (const m of team.members) teamSets.push({ label: `${t.label} · ${prettyName(m.nickname ?? m.name)}`, member: m });
    } catch { /* time privado ou removido */ }
  }
}

function applyMember(i: 0 | 1, m: Member): Promise<void> {
  const sd = sides[i];
  sd.species = m.name; sd.level = m.level; sd.nature = m.nature;
  sd.ability = m.ability?.name ?? ""; sd.item = m.item?.name ?? "";
  sd.evs = { ...m.evs }; sd.ivs = { ...m.ivs };
  sd.moves.forEach((slot, n) => { slot.name = m.moves[n]?.name ?? ""; slot.crit = false; slot.z = false; });
  return loadDetail(i).then(() => { drawPanel(i); recalc(); });
}

// ---------------------------------------------------------------
// Eventos
// ---------------------------------------------------------------
async function onChange(e: Event): Promise<void> {
  const t = e.target;
  if (!(t instanceof HTMLInputElement || t instanceof HTMLSelectElement || t instanceof HTMLTextAreaElement)) return;
  const d = t.dataset;
  const checked = t instanceof HTMLInputElement && t.type === "checkbox" ? t.checked : false;

  if (d.field) {
    const k = d.field as keyof FieldOpts;
    if (k === "weather" || k === "terrain") field[k] = t.value;
    else if (k !== "side") (field[k] as boolean) = checked;
    recalc();
    return;
  }
  if (d.fs !== undefined && d.fk) {
    const f = field.side[Number(d.fs) as 0 | 1];
    if (d.fk === "spikes") f.spikes = clampInt(t.value, 0, 3);
    else (f[d.fk as Exclude<keyof SideField, "spikes">] as boolean) = checked;
    recalc();
    return;
  }
  if (d.s === undefined) return;
  const i = Number(d.s) as 0 | 1;
  const sd = sides[i];

  if (d.f === "species") { if (e.type === "change") await setSpecies(i, t.value); return; }
  if (d.f) {
    switch (d.f) {
      case "level": sd.level = clampInt(t.value, 1, 100) || 1; break;
      case "nature": sd.nature = t.value; break;
      case "ability": sd.ability = t.value; break;
      case "item": sd.item = t.value; break;
      case "status": sd.status = t.value; break;
      case "hp": sd.hpPct = clampInt(t.value, 1, 100); { const el = $(`#hpv-${i}`); if (el) el.textContent = `${sd.hpPct}%`; } break;
      case "teraOn": sd.teraOn = checked; break;
      case "tera": sd.tera = t.value; break;
      case "dynamax": sd.dynamax = checked; break;
      case "gmax": sd.gmax = checked; break;
      case "identified": sd.identified = checked; break;
      default: break;
    }
  } else if (d.ev) sd.evs[d.ev as StatKey] = clampInt(t.value, 0, 252);
  else if (d.iv) sd.ivs[d.iv as StatKey] = clampInt(t.value, 0, 31);
  else if (d.boost) sd.boosts[d.boost as StatKey5] = clampInt(Number(t.value) + 6, 0, 12) - 6;
  else if (d.m !== undefined && d.mf) {
    const slot = sd.moves[Number(d.m)];
    if (slot) {
      if (d.mf === "name") slot.name = t.value;
      else if (d.mf === "crit") slot.crit = checked;
      else if (d.mf === "z") slot.z = checked;
      else if (d.mf === "hits") slot.hits = clampInt(t.value, 0, 10);
    }
  }
  recalc();
}

async function onClick(e: MouseEvent): Promise<void> {
  const b = (e.target as HTMLElement).closest<HTMLElement>("[data-act]");
  if (!b) return;
  const i = Number(b.dataset.s) as 0 | 1;
  const io = $(`#io-${i}`);
  switch (b.dataset.act) {
    case "swap":
      sides = [sides[1], sides[0]];
      field.side = [field.side[1], field.side[0]];
      drawPanel(0); drawPanel(1);
      $("#fieldbox")!.innerHTML = fieldHtml();
      recalc();
      break;
    case "export":
      if (io) io.innerHTML = `<textarea rows="9" readonly>${esc(exportSet(sides[i]))}</textarea>`;
      break;
    case "import":
      if (io) io.innerHTML = `<textarea rows="9" id="imp-${i}" placeholder="Cole um set no formato do Pokémon Showdown"></textarea><button type="button" data-act="do-import" data-s="${i}">Aplicar</button>`;
      break;
    case "do-import": {
      const ta = $<HTMLTextAreaElement>(`#imp-${i}`);
      if (ta) await importSet(i, ta.value);
      break;
    }
    case "load":
      if (io) {
        io.innerHTML = `<p class="muted">Carregando seus times...</p>`;
        await loadTeamSets();
        io.innerHTML = `<select id="tl-${i}"><option value="">Escolha um Pokémon de um time...</option>${(teamSets ?? []).map((t, n) => `<option value="${n}">${esc(t.label)}</option>`).join("")}</select>`;
        $(`#tl-${i}`)!.onchange = async (ev) => {
          const set = (teamSets ?? [])[Number((ev.target as HTMLSelectElement).value)];
          if (set) await applyMember(i, set.member);
        };
      }
      break;
    default: break;
  }
}

async function main(): Promise<void> {
  await boot("/calculadora");
  const box = app();
  box.innerHTML = `<section class="calc"><h2>Calculadora de dano</h2>
    <p class="muted">Usa o mesmo motor da batalha. Escolha dois Pokémon, ajuste a build e o campo, e veja o dano nos dois sentidos.</p>
    <p class="muted" id="loading">Carregando dados...</p></section>`;
  try {
    const [cat, mv, it, chart] = await Promise.all([api.listPokemon(), api.getMoveCatalog(), api.listItems(), api.getTypeChart()]);
    catalog = cat; items = it;
    setTypeChart(chart);
    for (const p of catalog) bySlug.set(p.name, p);
    for (const m of mv) moves.set(m.name, m);
  } catch (e) {
    box.innerHTML = `<p class="error">${esc(errorMessage(e))}</p><p class="muted">Rode <code>bun run db:import</code> se os dados ainda não foram importados.</p>`;
    return;
  }

  box.innerHTML = `<section class="calc"><h2>Calculadora de dano</h2>
    <p class="muted">Usa o mesmo motor da batalha. Escolha dois Pokémon, ajuste a build e o campo, e veja o dano nos dois sentidos.</p>
    <datalist id="species-list">${catalog.map((p) => `<option value="${esc(prettyName(p.name))}"></option>`).join("")}</datalist>
    <datalist id="moves-list">${[...moves.keys()].map((n) => `<option value="${esc(prettyName(n))}"></option>`).join("")}</datalist>
    <datalist id="items-list">${items.map((i) => `<option value="${esc(prettyName(i.name))}"></option>`).join("")}</datalist>
    <div class="card" id="results"></div>
    <div class="calc-grid"><div class="card" id="p0"></div><div class="card" id="p1"></div></div>
    <div class="card" id="fieldbox">${fieldHtml()}</div></section>`;

  await Promise.all([loadDetail(0), loadDetail(1)]);
  drawPanel(0); drawPanel(1);
  box.addEventListener("input", (e) => void onChange(e));
  box.addEventListener("change", (e) => void onChange(e));
  box.addEventListener("click", (e) => void onClick(e));
  recalc();
}
void main();