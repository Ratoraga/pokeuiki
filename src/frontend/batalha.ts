import { BOT_USERNAME } from "../shared/api";
import { chooseAction, chooseReplacement } from "../shared/battle/ai";
import { Z_CRYSTALS, Z_MOVE_NAMES, isSupported } from "../shared/battle/data";
import {
  activeMon, canDynamax, canGigantamax, canMega, canSwitch, canTera, canZ, createBattle, effMove,
  hasGimmick, monName, playTurn, replaceFainted, resumePivot, setMoveCatalog, setTypeChart, usableMoves,
} from "../shared/battle/engine";
import type { Action, BattleState, BattleTeamData, Gimmick, Mon, SideState } from "../shared/battle/types";
import { TYPES } from "../shared/pokemonTypes";
import { api, errorMessage, session } from "./api";
import { $, app, boot, esc, img, typeBadge } from "./common";
import { prettyName, typeLabel } from "./format";
import { spriteUrl, type Team } from "./types";

const STATUS_LABEL: Record<string, string> = { brn: "QUEIMADO", par: "PARALISADO", psn: "ENVENENADO", tox: "ENVENENADO+", slp: "DORMINDO", frz: "CONGELADO" };
const WEATHER_LABEL: Record<string, string> = {
  sun: "☀ Sol", rain: "🌧 Chuva", sand: "🏜 Areia", snow: "❄ Neve", hail: "🌨 Granizo",
  "harsh-sun": "☀☀ Sol extremo", "heavy-rain": "🌧🌧 Chuva torrencial", "strong-winds": "🌪 Ventos fortes",
};
const TERRAIN_LABEL: Record<string, string> = { electric: "⚡ Terreno Elétrico", grassy: "🌿 Terreno de Grama", misty: "🌫 Terreno de Névoa", psychic: "🔮 Terreno Psíquico" };
const hpClass = (pct: number) => (pct > 50 ? "hp-green" : pct > 20 ? "hp-yellow" : "hp-red");

function monSprite(mon: Mon): string {
  if (mon.mega && mon.data.mega?.sprite) return mon.data.mega.sprite;
  if (mon.flags.gmax && mon.data.gmax?.sprite) return mon.data.gmax.sprite;
  return mon.data.sprite ?? spriteUrl(mon.data.pokemon_id);
}

function monPanel(mon: Mon, owner: string, back: boolean): string {
  const pct = Math.round((mon.hp / mon.maxHp) * 100);
  const stages = Object.entries(mon.stages).filter(([, v]) => v !== 0).map(([k, v]) => `${k.toUpperCase()} ${v > 0 ? "+" : ""}${v}`);
  const tags = [
    mon.tera ? `Tera ${typeLabel(mon.tera)}` : null, mon.mega ? "Mega" : null,
    mon.v.dynamax > 0 ? `${mon.flags.gmax ? "Gigantamax" : "Dynamax"} (${mon.v.dynamax})` : null,
    mon.v.substitute > 0 ? "Substituto" : null, mon.v.confusion > 0 ? "Confuso" : null,
    mon.v.leechSeed ? "Semeado" : null, mon.v.taunt > 0 ? "Provocado" : null,
  ].filter((t): t is string => t !== null);
  return `<div class="mon-panel"><img class="sprite ${back ? "back" : ""}" src="${esc(monSprite(mon))}" alt="">
    <div class="info"><small class="muted">${esc(owner)}</small>
    <div><strong>${esc(monName(mon))}</strong> <span class="muted">Nv. ${mon.data.level}</span>${mon.status ? `<span class="status-badge">${STATUS_LABEL[mon.status]}</span>` : ""}</div>
    <div class="hpbar"><div class="hpfill ${hpClass(pct)}" style="width:${pct}%"></div></div>
    <small>${mon.hp}/${mon.maxHp} (${pct}%)</small>
    ${tags.length + stages.length > 0 ? `<div class="stages">${esc([...tags, ...stages].join(" · "))}</div>` : ""}</div></div>`;
}

function sideChips(st: SideState, label: string): string[] {
  const c: string[] = [];
  const h = st.hazards;
  if (h.stealthRock) c.push(`${label}: Stealth Rock`);
  if (h.spikes) c.push(`${label}: Spikes ×${h.spikes}`);
  if (h.toxicSpikes) c.push(`${label}: Toxic Spikes ×${h.toxicSpikes}`);
  if (h.stickyWeb) c.push(`${label}: Sticky Web`);
  if (st.screens.reflect) c.push(`${label}: Reflect`);
  if (st.screens.lightScreen) c.push(`${label}: Light Screen`);
  if (st.screens.auroraVeil) c.push(`${label}: Aurora Veil`);
  if (st.tailwind) c.push(`${label}: Tailwind`);
  return c;
}

// ---------------------------------------------------------------
// A batalha
// ---------------------------------------------------------------
function startBattle(box: HTMLElement, player: BattleTeamData, bot: BattleTeamData, onExit: () => void): void {
  const init = createBattle([player.mons, bot.mons]);
  let state: BattleState = init.state;
  let log: string[] = init.log;
  let gimmick: Gimmick | null = null;
  let gmax = false;
  let teraType = "normal";

  /** Resolve o que o bot precisa decidir (troca por U-turn, substituto). */
  function settle(start: BattleState, lines: string[]): BattleState {
    let s = start;
    for (let guard = 0; guard < 8 && s.winner === null; guard++) {
      if (s.pivot === 1) { const r = resumePivot(s, 1, chooseReplacement(s, 1), Math.random); s = r.state; lines.push(...r.log); continue; }
      if (s.pivot === 0) break;
      if (s.pending[1]) { const r = replaceFainted(s, 1, chooseReplacement(s, 1), Math.random); s = r.state; lines.push(...r.log); continue; }
      break;
    }
    return s;
  }
  const commit = (next: BattleState, lines: string[]) => { state = next; log = [...log, ...lines]; gimmick = null; gmax = false; render(); };

  function act(action: Action) {
    const me = activeMon(state, 0);
    const mustPick = state.pending[0] || state.pivot === 0;
    const canAct = state.winner === null && !mustPick && !me.fainted;
    if (!canAct && !(action.kind === "move" && me.v.recharge)) return;
    const turn = playTurn(state, [action, chooseAction(state, 1, Math.random)], Math.random);
    const lines = [...turn.log];
    commit(settle(turn.state, lines), lines);
  }
  function pickReplacement(to: number) {
    const r = state.pivot === 0 ? resumePivot(state, 0, to, Math.random) : replaceFainted(state, 0, to, Math.random);
    const lines = [...r.log];
    commit(settle(r.state, lines), lines);
  }

  function render() {
    const me = activeMon(state, 0), foe = activeMon(state, 1);
    const over = state.winner !== null;
    const mustPick = state.pending[0] || state.pivot === 0;
    const canAct = !over && !mustPick && !me.fainted;
    const usable = new Set(usableMoves(me));
    const recharging = me.v.recharge;
    const crystal = me.item ? Z_CRYSTALS[me.item] : undefined;
    const chips = [
      state.field.weather ? WEATHER_LABEL[state.field.weather] : null,
      state.field.terrain ? TERRAIN_LABEL[state.field.terrain] : null,
      state.field.trickRoom > 0 ? "🌀 Trick Room" : null,
      ...sideChips(state.sides[0], "Você"), ...sideChips(state.sides[1], "Bot"),
    ].filter((c): c is string => !!c);

    const showZ = !!crystal && !hasGimmick(me) && !state.sides[0].gimmicks.z;
    const hasGimmicks = canMega(state, 0) || canTera(state, 0) || canDynamax(state, 0) || showZ;
    const gbtn = (g: Gimmick | "", label: string, active: boolean, gm = false) =>
      `<button type="button" class="${active ? "active" : ""}" data-a="gimmick" data-g="${g}" data-gmax="${gm ? 1 : 0}">${label}</button>`;
    const gimmicksHtml = hasGimmicks ? `<div class="gimmicks">
      ${gbtn("", "Normal", gimmick === null)}
      ${canMega(state, 0) ? gbtn("mega", "Mega Evolução", gimmick === "mega") : ""}
      ${canTera(state, 0) ? gbtn("tera", "Terastalizar", gimmick === "tera") : ""}
      ${canDynamax(state, 0) ? gbtn("dynamax", "Dynamax", gimmick === "dynamax" && !gmax) : ""}
      ${canGigantamax(state, 0) ? gbtn("dynamax", "Gigantamax", gimmick === "dynamax" && gmax, true) : ""}
      ${showZ ? gbtn("z", "Golpe Z", gimmick === "z") : ""}
      ${gimmick === "tera" ? `<select id="tera"><option value="stellar" ${teraType === "stellar" ? "selected" : ""}>Estelar</option>${TYPES.map((t) => `<option value="${t}" ${teraType === t ? "selected" : ""}>${esc(typeLabel(t))}</option>`).join("")}</select>` : ""}
    </div>` : "";

    const moveButtons = recharging
      ? `<button class="move-btn" data-a="free"><strong>Recarregar</strong><small class="muted">Passa o turno</small></button>`
      : me.data.moves.map((mv, i) => {
        const zOk = gimmick === "z" ? canZ(state, 0, i) : true;
        const shown = me.v.dynamax > 0 ? effMove(me, mv).name : gimmick === "z" && canZ(state, 0, i) ? (Z_MOVE_NAMES[mv.type] ?? mv.name) : mv.name;
        const off = !canAct || !usable.has(i) || !zOk;
        return `<button class="move-btn" data-a="move" data-i="${i}" ${off ? "disabled" : ""} ${isSupported(mv) ? "" : 'title="Este golpe ainda não é suportado no simulador"'}>
          <strong>${esc(prettyName(shown))}</strong>
          <span>${typeBadge(mv.type)} ${mv.damage_class === "status" ? "Status" : `Poder ${mv.power ?? "variável"}`}</span>
          <small class="muted">PP ${me.ppLeft[i] ?? 0}/${mv.pp}${isSupported(mv) ? "" : " · sem efeito no simulador"}</small></button>`;
      }).join("") + (usable.size === 0 ? `<button class="move-btn" data-a="free" ${canAct ? "" : "disabled"}><strong>Struggle</strong><small class="muted">Sem golpes utilizáveis</small></button>` : "");

    const bench = state.sides[0].team.map((m, i) => {
      const isActive = i === state.sides[0].active && !m.fainted;
      const blocked = !mustPick && (!canAct || !canSwitch(state, 0) || recharging);
      const off = m.fainted || isActive || blocked;
      return `<button class="bench-btn" data-a="${mustPick ? "pick" : "switch"}" data-i="${i}" ${off ? "disabled" : ""}>
        <img src="${esc(spriteUrl(m.data.pokemon_id))}" alt=""><span>${esc(monName(m))}<br><small class="muted">${m.fainted ? "Desmaiado" : `${Math.round((m.hp / m.maxHp) * 100)}% HP`}</small></span></button>`;
    }).join("");

    box.innerHTML = `<section class="battle">
      ${chips.length ? `<div class="field-chips">${chips.map((c) => `<span class="chip">${esc(c)}</span>`).join("")}</div>` : ""}
      <div class="arena">${monPanel(foe, `Bot · ${bot.name}`, false)}${monPanel(me, `Você · ${player.name}`, true)}</div>
      ${over ? `<div class="card banner"><h2>${state.winner === 0 ? "Você venceu! 🎉" : "O bot venceu."}</h2>
        <div class="actions center"><button class="primary" data-a="restart">Jogar de novo</button><button data-a="exit">Escolher outros times</button></div></div>` : ""}
      ${!over && mustPick ? `<div class="card"><h3>${state.pivot === 0 ? "Escolha quem entra no lugar" : "Escolha o próximo Pokémon"}</h3></div>` : ""}
      ${!over && !mustPick ? `<div class="card"><h3>O que ${esc(monName(me))} vai fazer?</h3>${gimmicksHtml}<div class="move-grid">${moveButtons}</div></div>` : ""}
      ${!over ? `<div class="card"><h3>${mustPick ? "Seus Pokémon" : "Trocar de Pokémon"}</h3><div class="bench">${bench}</div></div>` : ""}
      <div class="card"><h3>Registro da batalha</h3><div class="battle-log" id="log">${log.map((l) => `<div class="${l.startsWith("—") ? "log-turn" : ""}">${esc(l)}</div>`).join("")}</div></div></section>`;
    const el = $("#log");
    if (el) el.scrollTop = el.scrollHeight;
  }

  box.onclick = (e) => {
    const el = (e.target as HTMLElement).closest<HTMLElement>("[data-a]");
    if (!el || (el as HTMLButtonElement).disabled) return;
    const i = Number(el.dataset.i);
    switch (el.dataset.a) {
      case "move": act({ kind: "move", index: i, gimmick: gimmick ?? undefined, teraType: gimmick === "tera" ? teraType : undefined, gmax: gimmick === "dynamax" ? gmax : undefined }); break;
      case "free": act({ kind: "move", index: -1 }); break;
      case "switch": act({ kind: "switch", to: i }); break;
      case "pick": pickReplacement(i); break;
      case "gimmick": gimmick = (el.dataset.g as Gimmick) || null; gmax = el.dataset.gmax === "1"; render(); break;
      case "restart": startBattle(box, player, bot, onExit); break;
      case "exit": onExit(); break;
    }
  };
  box.onchange = (e) => {
    const t = e.target;
    if (t instanceof HTMLSelectElement && t.id === "tera") teraType = t.value;
  };
  render();
}

// ---------------------------------------------------------------
// Escolha dos times
// ---------------------------------------------------------------
async function main() {
  await boot("/batalha");
  const box = app();
  const user = session.user;

  let presets: Team[] = [];
  let mine: Team[] = [];
  try { presets = (await api.teamsOfUser(BOT_USERNAME)).filter((t) => t.pokemon.length > 0); } catch { /* sem times prontos */ }
  if (user) { try { mine = (await api.teamsOfUser(user.username)).filter((t) => t.pokemon.length > 0); } catch { /* ignora */ } }

  let playerChoice: number | null = null;
  let botChoice: number | "random" = "random";
  let error = "";
  let loading = false;

  const option = (t: Team, group: string, checked: boolean) => `<label class="team-option ${checked ? "selected" : ""}">
    <input type="radio" name="${group}" value="${t.id}" ${checked ? "checked" : ""}><div><strong>${esc(t.name)}</strong>
    ${t.description ? `<div class="muted small">${esc(t.description)}</div>` : ""}
    <div class="mini-sprites">${t.pokemon.map((p) => img(p.pokemon_id, 36)).join("")}</div></div></label>`;
  const list = (group: string, isChecked: (id: number) => boolean) => `<h4 class="muted">Times prontos</h4>
    ${presets.map((t) => option(t, group, isChecked(t.id))).join("")}
    <h4 class="muted">Seus times salvos</h4>
    ${!user ? `<p class="muted">Entre na sua conta para usar seus próprios times.</p>` : mine.length === 0 ? `<p class="muted">Você ainda não tem times com Pokémon.</p>` : ""}
    ${mine.map((t) => option(t, group, isChecked(t.id))).join("")}`;

  function drawSetup() {
    box.innerHTML = `<section><h2>Batalha contra o bot</h2>
      <p class="muted">6 contra 6, com clima, terrenos, armadilhas, Mega Evolução, Terastalização, Dynamax/Gigantamax e Z-Moves. O bot enxerga seu time, pontua cada golpe pelo dano esperado, prioriza nocautes, faz setup, usa armadilhas e troca de Pokémon quando o confronto está desfavorável.</p>
      ${presets.length === 0 ? `<p class="error">Os times prontos ainda não foram criados. Rode: <code>bun run db:presets</code></p>` : ""}
      <div class="setup-grid">
        <div class="card"><h3>Seu time</h3>${list("player", (id) => playerChoice === id)}</div>
        <div class="card"><h3>Time do bot</h3>
          <label class="team-option ${botChoice === "random" ? "selected" : ""}"><input type="radio" name="bot" value="random" ${botChoice === "random" ? "checked" : ""}><strong>Aleatório (prontos e seus)</strong></label>
          ${list("bot", (id) => botChoice === id)}</div></div>
      ${error ? `<p class="error">${esc(error)}</p>` : ""}
      <div class="actions"><button class="primary" id="start" ${loading || playerChoice === null || presets.length === 0 ? "disabled" : ""}>${loading ? "Carregando..." : "Começar batalha"}</button></div></section>`;
  }

  box.onchange = (e) => {
    const t = e.target;
    if (!(t instanceof HTMLInputElement) || t.type !== "radio") return;
    if (t.name === "player") playerChoice = Number(t.value);
    if (t.name === "bot") botChoice = t.value === "random" ? "random" : Number(t.value);
    drawSetup();
  };
  box.onclick = async (e) => {
    if (!(e.target as HTMLElement).closest("#start") || playerChoice === null) return;
    const pool = [...presets, ...mine];
    if (pool.length === 0) return;
    error = ""; loading = true; drawSetup();
    try {
      const botId = botChoice === "random" ? pool[Math.floor(Math.random() * pool.length)]!.id : botChoice;
      const [player, bot, chart, catalog] = await Promise.all([
        api.getBattleTeam(playerChoice), api.getBattleTeam(botId), api.getTypeChart(), api.getMoveCatalog(),
      ]);
      setTypeChart(chart);
      setMoveCatalog(catalog);
      loading = false;
      box.onchange = null;
      startBattle(box, player, bot, () => location.reload());
    } catch (err) {
      loading = false;
      error = errorMessage(err);
      drawSetup();
    }
  };
  drawSetup();
}
void main();