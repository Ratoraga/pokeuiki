import { at, monName, pretty } from "../shared/battle/engine";
import {
  alive, chooseDoubles, createDoublesBattle, gimmickInfo, key, legalDoubles, monAt, playTurnDoubles,
  replaceSlot, settleDoubles, SLOTS, targetKind, targetOptions, benchIdxs, resumeDoublesPivot,
  type DAction, type Slot, type TargetRef,
} from "../shared/battle/doubles";
import type { BattleMonData, BattleState, Gimmick, Mon } from "../shared/battle/types";
import { esc, img } from "./common";

type G = { g: Gimmick | null; gmax: boolean };

export function startDoubles(box: HTMLElement, playerMons: BattleMonData[], botMons: BattleMonData[], onExit: () => void): void {
  if (playerMons.length < 2 || botMons.length < 2) {
    box.innerHTML = `<p class="error">Os dois times precisam ter pelo menos 2 Pokémon para batalhas em dupla.</p><button id="back">Voltar</button>`;
    box.querySelector("#back")!.addEventListener("click", onExit);
    return;
  }
  const botPick = botMons.slice(0, 4);
  if (playerMons.length <= 4) return begin(box, playerMons, botPick, onExit);

  const chosen: number[] = [];
  const draw = () => {
    box.innerHTML = `<h2>Escolha 4 Pokémon (os 2 primeiros serão os líderes)</h2>
      <div class="dbl-pick">${playerMons.map((m, i) => {
        const n = chosen.indexOf(i);
        return `<button data-i="${i}" class="${n >= 0 ? "on" : ""}">${n >= 0 ? `${n + 1}º · ` : ""}${esc(m.nickname ?? m.species)}</button>`;
      }).join("")}</div>
      <button id="go" ${chosen.length === 4 ? "" : "disabled"}>Começar</button> <button id="back">Voltar</button>`;
    box.querySelectorAll<HTMLElement>("[data-i]").forEach((b) => b.addEventListener("click", () => {
      const i = Number(b.dataset.i), at0 = chosen.indexOf(i);
      if (at0 >= 0) chosen.splice(at0, 1); else if (chosen.length < 4) chosen.push(i);
      draw();
    }));
    box.querySelector("#go")?.addEventListener("click", () => begin(box, chosen.map((i) => playerMons[i]!), botPick, onExit));
    box.querySelector("#back")!.addEventListener("click", onExit);
  };
  draw();
}

function begin(box: HTMLElement, mine: BattleMonData[], foe: BattleMonData[], onExit: () => void): void {
  const created = createDoublesBattle([mine, foe]);
  let state: BattleState = created.state;
  let log: string[] = [...created.log];
  let sel: (DAction | null)[] = [null, null];
  let gim: G[] = [{ g: null, gmax: false }, { g: null, gmax: false }];
  let targeting: { slot: Slot; index: number } | null = null;
  let busy = false;

  const bar = (m: Mon) => {
    const pct = Math.max(0, Math.round((m.hp / m.maxHp) * 100));
    return `<div class="hpbar"><i style="width:${pct}%"></i></div><small>${m.hp}/${m.maxHp} (${pct}%)${m.status ? " · " + m.status : ""}</small>`;
  };
  const spriteOf = (m: Mon): string | null => (m.mega && m.data.mega?.sprite ? m.data.mega.sprite : m.data.sprite);
  const panel = (side: 0 | 1, slot: Slot) => {
    const m = monAt(state, side, slot);
    if (!m) return `<div class="dbl-mon empty">—</div>`;
    const src = spriteOf(m);
    const pic = src ? `<img class="dbl-sprite" src="${esc(src)}" alt="" width="96" height="96">` : img(m.data.pokemon_id, 96);
    return `<div class="dbl-mon ${m.fainted ? "fainted" : ""}">${pic}<b>${esc(monName(m))}</b>${m.fainted ? "<small>desmaiado</small>" : bar(m)}</div>`;
  };
  const label = (t: TargetRef) => `${t.side === 0 ? "Aliado" : "Adversário"}: ${esc(monName(monAt(state, t.side, t.slot)!))}`;

  const playerPending = () => SLOTS.filter((sl) => state.dpend?.[key(0, sl)]);
  const needed = () => SLOTS.filter((sl) => alive(state, 0, sl));
  const ready = () => needed().every((sl) => sel[sl]);

  function render(): void {
    const w = state.winner;
    let html = `<div class="dbl-arena"><div class="dbl-row">${panel(1, 0)}${panel(1, 1)}</div><div class="dbl-row">${panel(0, 0)}${panel(0, 1)}</div></div>`;
    if (w !== null) {
      html += `<h3>${w === 0 ? "Você venceu!" : "O bot venceu."}</h3><button data-a="exit">Voltar</button>`;
    } else if (state.dpivot) {
      const sl = state.dpivot.slot;
      html += `<h3>${esc(monName(monAt(state, 0, sl)!))} usou um golpe de troca! Quem entra?</h3>` +
        benchIdxs(state, 0).map((i) => `<button data-a="pivot" data-i="${i}">${img(state.sides[0].team[i]!.data.pokemon_id, 40)} ${esc(monName(state.sides[0].team[i]!))}</button>`).join(" ");
      } else if (playerPending().length) {
      const sl = playerPending()[0]!;
      html += `<h3>Quem entra no lugar de ${esc(monName(monAt(state, 0, sl)!))}?</h3>` +
        benchIdxs(state, 0).map((i) => `<button data-a="repl" data-k="${sl}" data-i="${i}">${img(state.sides[0].team[i]!.data.pokemon_id, 40)} ${esc(monName(state.sides[0].team[i]!))}</button>`).join(" ");
    } else {
      for (const sl of needed()) html += actionCard(sl);
      html += `<button data-a="run" ${ready() && !busy ? "" : "disabled"}>${busy ? "O bot está pensando…" : "Executar turno"}</button>`;
    }
    html += `<pre class="log">${esc(log.slice(-40).join("\n"))}</pre>`;
    box.innerHTML = html;
  }

  function actionCard(sl: Slot): string {
    const me = monAt(state, 0, sl)!;
    const legal = legalDoubles(state, 0, sl);
    const picked = sel[sl];
    let h = `<div class="dbl-card"><h4>${esc(monName(me))}</h4>`;
    if (picked) {
      const txt = picked.kind === "switch" ? `Trocar para ${esc(monName(state.sides[0].team[picked.to]!))}`
        : `${picked.index < 0 ? "Struggle" : pretty(at(me.data.moves, picked.index).name)}${picked.target ? " → " + label(picked.target) : ""}${gim[sl]!.g ? " [" + gim[sl]!.g + "]" : ""}`;
      return h + `<p>${txt}</p><button data-a="clear" data-k="${sl}">Mudar</button></div>`;
    }
    if (targeting && targeting.slot === sl) {
      const mv = at(me.data.moves, targeting.index);
      return h + `<p>Alvo de ${pretty(mv.name)}:</p>` +
        targetOptions(state, 0, sl, mv).map((t) => `<button data-a="target" data-k="${sl}" data-s="${t.side}" data-t="${t.slot}">${label(t)}</button>`).join(" ") + `</div>`;
    }
    const idxs = [...new Set(legal.filter((a) => a.kind === "move").map((a) => (a as { index: number }).index))];
    h += idxs.map((i) => i < 0 ? `<button data-a="move" data-k="${sl}" data-i="-1">Struggle / passar</button>`
      : `<button data-a="move" data-k="${sl}" data-i="${i}">${pretty(at(me.data.moves, i).name)} <small>${me.ppLeft[i]}</small></button>`).join(" ");
    const gi = gimmickInfo(state, 0, sl, idxs.find((i) => i >= 0) ?? 0);
    const opt = (g: Gimmick, ok: boolean, name: string) => ok ? `<button data-a="gim" data-k="${sl}" data-g="${g}" class="${gim[sl]!.g === g ? "on" : ""}">${name}</button>` : "";
    h += `<div>${opt("mega" as Gimmick, gi.mega, "Mega")}${opt("tera" as Gimmick, gi.tera, "Tera")}${opt("dynamax" as Gimmick, gi.dynamax || gi.gmax, "Dynamax")}${opt("z" as Gimmick, gi.z, "Z")}</div>`;
    const sw = legal.filter((a) => a.kind === "switch");
    if (sw.length) h += `<div>${sw.map((a) => `<button data-a="sw" data-k="${sl}" data-i="${(a as { to: number }).to}">Trocar: ${esc(monName(state.sides[0].team[(a as { to: number }).to]!))}</button>`).join(" ")}</div>`;
    return h + `</div>`;
  }

  const commitMove = (sl: Slot, index: number, target?: TargetRef) => {
    const g = gim[sl]!;
    const a: DAction = { kind: "move", index, target };
    if (g.g) { a.gimmick = g.g === ("dynamax" as Gimmick) && g.gmax ? ("dynamax" as Gimmick) : g.g; if (g.g === ("dynamax" as Gimmick) && gimmickInfo(state, 0, sl, index).gmax) a.gmax = true; }
    sel[sl] = a;
    targeting = null;
  };

  function run(): void {
    busy = true; render();
    setTimeout(() => {
      const botActs = chooseDoubles(state, 1, Math.random);
      const turn = playTurnDoubles(state, [sel[0] ?? null, sel[1] ?? null, botActs[0] ?? null, botActs[1] ?? null], Math.random);
      const extra: string[] = [];
      settleDoubles(turn.state, Math.random, extra);
      state = turn.state;
      log = [...log, ...turn.log, ...extra];
      sel = [null, null];
      gim = [{ g: null, gmax: false }, { g: null, gmax: false }];
      busy = false;
      render();
    }, 30);
  }

  box.onclick = (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>("[data-a]");
    if (!b || busy) return;
    const sl = Number(b.dataset.k) as Slot, i = Number(b.dataset.i);
    switch (b.dataset.a) {
      case "move": {
        const me = monAt(state, 0, sl)!;
        if (i < 0) { commitMove(sl, -1); break; }
        const mv = at(me.data.moves, i);
        const opts = targetOptions(state, 0, sl, mv);
        if (targetKind(mv) === "single" && opts.length > 1) targeting = { slot: sl, index: i };
        else commitMove(sl, i, opts[0]);
        break;
      }
      case "pivot": {
        const r = resumeDoublesPivot(state, i, Math.random);
        settleDoubles(r.state, Math.random, r.log);
        state = r.state; log = [...log, ...r.log];
        break;
      }
      case "target": commitMove(sl, targeting!.index, { side: Number(b.dataset.s) as 0 | 1, slot: Number(b.dataset.t) as Slot }); break;
      case "sw": sel[sl] = { kind: "switch", to: i }; break;
      case "gim": gim[sl] = { g: gim[sl]!.g === (b.dataset.g as Gimmick) ? null : (b.dataset.g as Gimmick), gmax: false }; break;
      case "clear": sel[sl] = null; targeting = null; break;
      case "repl": {
        const r = replaceSlot(state, 0, sl, i, Math.random);
        state = r.state; log = [...log, ...r.log];
        break;
      }
      case "run": run(); return;
      case "exit": onExit(); return;
    }
    render();
  };
  render();
}