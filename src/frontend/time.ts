import { applyStatModifiers, defenseNotes, offenseNotes, type ModifierContext } from "../shared/modifiers";
import { NATURE_NAMES, STAT_KEYS, STAT_LABELS, calcStats, natureLabel, type StatBlock, type StatKey } from "../shared/stats";
import { api, errorMessage, session } from "./api";
import { analysisHtml } from "./analysis-view";
import { $, app, boot, esc, img, typeBadge } from "./common";
import { isBattleOnlyForm, prettyName, typeLabel } from "./format";
import { itemSpriteUrl, type Analysis, type Item, type Member, type Pokemon, type PokemonDetail, type TeamDetail } from "./types";

const MAX_MEMBERS = 6;
const teamId = Number(new URLSearchParams(location.search).get("id"));

let team: TeamDetail;
let analysis: Analysis | null = null;
let analysisError: string | null = null;
let tab: "build" | "analysis" = "build";
let catalog: Pokemon[] | null = null;

async function load() {
  team = await api.getTeam(teamId);
  try { analysis = await api.getAnalysis(teamId); analysisError = null; }
  catch (e) { analysis = null; analysisError = errorMessage(e); }
}

const panel = () => $("#panel")!;
const notice = (text: string, cls = "muted") => { const n = $("#notice")!; n.className = cls; n.textContent = text; };

function evSummary(m: Member): string {
  const parts = STAT_KEYS.filter((k) => m.evs[k] > 0).map((k) => `${m.evs[k]} ${STAT_LABELS[k]}`);
  return parts.length ? parts.join(" / ") : "—";
}

function memberCard(m: Member): string {
  return `<article class="card member">
    <div class="member-head">${img(m.pokemon_id)}<div>
      <h3>${esc(m.nickname ?? prettyName(m.name))}</h3>${m.nickname ? `<span class="muted">${esc(prettyName(m.name))}</span>` : ""}
      <div class="types">${typeBadge(m.type1)}${m.type2 ? typeBadge(m.type2) : ""}</div></div></div>
    <dl class="facts">
      <dt>Nível</dt><dd>${m.level}</dd>
      <dt>Natureza</dt><dd>${esc(prettyName(m.nature))}</dd>
      <dt>Habilidade</dt><dd>${m.ability ? esc(prettyName(m.ability.name)) : "—"}</dd>
      <dt>Item</dt><dd>${m.item ? `<img src="${esc(itemSpriteUrl(m.item.name))}" alt="" width="24" height="24"> ${esc(prettyName(m.item.name))}` : "—"}</dd>
      <dt>EVs</dt><dd>${esc(evSummary(m))}</dd></dl>
    <ul class="moves">${m.moves.length === 0 ? `<li class="muted">Sem golpes definidos</li>` : m.moves.map((mv) => `<li>${typeBadge(mv.type)} ${esc(prettyName(mv.name))}</li>`).join("")}</ul>
    ${team.is_owner ? `<div class="actions"><button class="primary" data-edit="${m.id}">Editar build</button><button class="danger" data-remove="${m.id}">Remover</button></div>` : ""}</article>`;
}

function drawBuild() {
  const canAdd = team.is_owner && team.members.length < MAX_MEMBERS;
  panel().innerHTML = `${canAdd ? `<div class="actions"><button class="primary" id="add">+ Adicionar Pokémon</button></div>` : ""}
    <div class="grid">${team.members.length ? team.members.map(memberCard).join("") : `<p class="muted">Este time não tem Pokémon.</p>`}</div>`;
}

function drawTab() {
  document.querySelectorAll<HTMLElement>("[data-tab]").forEach((b) => b.classList.toggle("active", b.dataset.tab === tab));
  if (tab === "analysis") panel().innerHTML = analysisError ? `<p class="error">${esc(analysisError)}</p>` : analysis ? analysisHtml(analysis) : `<p class="muted">Calculando...</p>`;
  else drawBuild();
}

// ---------- adicionar Pokémon ----------
async function drawPicker() {
  panel().innerHTML = `<div class="card form"><h2>Adicionar Pokémon</h2>
    <input id="pf" placeholder="Filtrar Pokémon por nome..."><p class="muted">Mostrando até 60 resultados. Clique em um Pokémon para adicioná-lo ao time.</p>
    <div class="catalog" id="pc"></div><p class="error" id="perr"></p><div class="actions"><button type="button" id="pcancel">Cancelar</button></div></div>`;
  catalog ??= await api.listPokemon();
  const exclude = new Set(team.members.map((m) => m.pokemon_id));
  const draw = () => {
    const term = $<HTMLInputElement>("#pf")!.value.trim().toLowerCase().replaceAll(" ", "-");
    const list = catalog!.filter((p) => !exclude.has(p.id) && !isBattleOnlyForm(p.name) && p.name.includes(term)).slice(0, 60);
    $("#pc")!.innerHTML = list.map((p) => `<button type="button" class="pick" data-pick="${p.id}">${img(p.id, 64)}<span>${esc(prettyName(p.name))}</span></button>`).join("");
  };
  draw();
  $("#pf")!.oninput = draw;
  $("#pcancel")!.onclick = drawBuild;
  $("#pc")!.onclick = async (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>("[data-pick]");
    if (!b) return;
    try {
      const { id } = await api.addMember(teamId, Number(b.dataset.pick));
      await load();
      const m = team.members.find((x) => x.id === id);
      if (m) await drawEditor(m); else drawTab();
    } catch (err) { $("#perr")!.textContent = errorMessage(err); }
  };
}

// ---------- editor de build ----------
async function drawEditor(m: Member) {
  panel().innerHTML = `<p class="muted">Carregando...</p>`;
  let detail: PokemonDetail;
  let items: Item[];
  try { [detail, items] = await Promise.all([api.getPokemon(m.pokemon_id), api.listItems()]); }
  catch (e) {
    panel().innerHTML = `<div class="card"><p class="error">${esc(errorMessage(e))}</p><button id="back">Voltar</button></div>`;
    $("#back")!.onclick = drawBuild;
    return;
  }

  const ivs: StatBlock = { ...m.ivs };
  const evs: StatBlock = { ...m.evs };
  panel().innerHTML = `<form class="card form editor" id="ed">
    <div class="member-head">${img(m.pokemon_id, 96)}<div><h2>${esc(prettyName(detail.name))}</h2>
      <div class="types">${typeBadge(detail.type1)}${detail.type2 ? typeBadge(detail.type2) : ""}</div></div></div>
    <div class="row">
      <label>Apelido<input id="nick" maxlength="50" value="${esc(m.nickname ?? "")}"></label>
      <label>Nível<input id="level" type="number" min="1" max="100" value="${m.level}"></label></div>
    <div class="row">
      <label>Natureza<select id="nature">${NATURE_NAMES.map((n) => `<option value="${n}" ${n === m.nature ? "selected" : ""}>${esc(prettyName(n))} (${esc(natureLabel(n))})</option>`).join("")}</select></label>
      <label>Habilidade<select id="ability"><option value="">— nenhuma —</option>${detail.abilities.map((a) => `<option value="${a.id}" ${a.id === m.ability?.id ? "selected" : ""}>${esc(prettyName(a.name))}${a.is_hidden ? " (oculta)" : ""}</option>`).join("")}</select></label></div>
    <label>Item<input id="item" list="items-list" value="${esc(m.item ? prettyName(m.item.name) : "")}" placeholder="Digite para buscar (ex: Choice Band, Eviolite)"></label>
    <datalist id="items-list">${items.map((i) => `<option value="${esc(prettyName(i.name))}"></option>`).join("")}</datalist>
    <fieldset><legend>Golpes</legend>
      <datalist id="moves-list">${detail.moves.map((mv) => `<option value="${esc(prettyName(mv.name))}" label="${esc(`${typeLabel(mv.type)} · ${mv.power ?? "—"}`)}"></option>`).join("")}</datalist>
      <div class="row">${[0, 1, 2, 3].map((i) => `<label>Golpe ${i + 1}
        <input class="mv" data-i="${i}" list="moves-list" placeholder="Digite para buscar" value="${esc(m.moves[i] ? prettyName(m.moves[i]!.name) : "")}">
        <span class="muted move-info" id="mi-${i}"></span></label>`).join("")}</div></fieldset>
    <fieldset><legend>Status</legend>
      <table class="stats-table"><thead><tr><th>Status</th><th>Base</th><th>IV (0–31)</th><th>EV (0–252)</th><th>Final</th><th>Com item/habilidade</th></tr></thead><tbody>
      ${STAT_KEYS.map((k) => `<tr><td>${STAT_LABELS[k]}</td><td>${detail.base[k]}</td>
        <td><input class="iv" data-k="${k}" type="number" min="0" max="31" value="${ivs[k]}"></td>
        <td><input class="ev" data-k="${k}" type="number" min="0" max="252" value="${evs[k]}"></td>
        <td><strong id="fin-${k}"></strong></td><td id="mod-${k}"></td></tr>`).join("")}</tbody></table>
      <p id="evtotal"></p><ul class="effects" id="effects"></ul></fieldset>
    <p class="error" id="err"></p>
    <div class="actions"><button class="primary" id="save">Salvar build</button><button type="button" id="cancel">Cancelar</button></div></form>`;

  const val = (id: string) => $<HTMLInputElement>(`#${id}`)!.value;
  const clampN = (raw: string, max: number) => Math.max(0, Math.min(max, Math.floor(Number(raw) || 0)));
  const findItem = (t: string) => items.find((i) => prettyName(i.name).toLowerCase() === t.trim().toLowerCase());
  const findMove = (t: string) => detail.moves.find((mv) => prettyName(mv.name).toLowerCase() === t.trim().toLowerCase());
  const level = () => Math.max(1, clampN(val("level"), 100));

  function recalc() {
    const nature = val("nature");
    const abilityId = Number(val("ability")) || null;
    const itemText = val("item");
    const base = calcStats(detail.base, ivs, evs, level(), nature);
    const ctx: ModifierContext = {
      ability: detail.abilities.find((a) => a.id === abilityId)?.name ?? null,
      item: itemText.trim() ? (findItem(itemText)?.name ?? null) : null,
      speciesId: detail.species_id, canEvolve: detail.can_evolve,
    };
    const mod = applyStatModifiers(base, ctx);
    for (const k of STAT_KEYS) {
      $(`#fin-${k}`)!.textContent = String(base[k]);
      const cell = $(`#mod-${k}`)!;
      cell.textContent = String(mod.stats[k]);
      cell.className = mod.stats[k] !== base[k] ? "leader" : "";
    }
    const total = STAT_KEYS.reduce((sum, k) => sum + evs[k], 0);
    const ev = $("#evtotal")!;
    ev.textContent = `EVs usados: ${total}/510. Cada 4 EVs rendem +1 de status no nível 100.`;
    ev.className = total > 510 ? "error" : "muted";
    $<HTMLButtonElement>("#save")!.disabled = total > 510;
    $("#effects")!.innerHTML = [...mod.notes, ...defenseNotes(ctx), ...offenseNotes(ctx.ability)].map((n) => `<li>${esc(n)}</li>`).join("");
    document.querySelectorAll<HTMLInputElement>(".mv").forEach((inp) => {
      const mv = inp.value.trim() ? findMove(inp.value) : undefined;
      $(`#mi-${inp.dataset.i}`)!.innerHTML = mv ? `${typeBadge(mv.type)} ${mv.damage_class === "status" ? "Status" : `Poder ${mv.power ?? "—"}`}` : "";
    });
  }

  const form = $<HTMLFormElement>("#ed")!;
  form.oninput = (e) => {
    const t = e.target as HTMLInputElement;
    if (t.classList.contains("iv")) ivs[t.dataset.k as StatKey] = clampN(t.value, 31);
    if (t.classList.contains("ev")) evs[t.dataset.k as StatKey] = clampN(t.value, 252);
    recalc();
  };
  form.onchange = (e) => { // corrige o número mostrado depois que o campo perde o foco
    const t = e.target as HTMLInputElement;
    if (t.classList.contains("iv")) t.value = String(ivs[t.dataset.k as StatKey]);
    if (t.classList.contains("ev")) t.value = String(evs[t.dataset.k as StatKey]);
    if (t.id === "level") t.value = String(level());
  };
  $("#cancel")!.onclick = drawBuild;
  form.onsubmit = async (e) => {
    e.preventDefault();
    const err = $("#err")!;
    err.textContent = "";
    let itemId: number | null = null;
    if (val("item").trim()) {
      const it = findItem(val("item"));
      if (!it) { err.textContent = `Item "${val("item")}" não encontrado. Escolha um da lista.`; return; }
      itemId = it.id;
    }
    const moves: number[] = [];
    for (const inp of document.querySelectorAll<HTMLInputElement>(".mv")) {
      if (!inp.value.trim()) continue;
      const mv = findMove(inp.value);
      if (!mv) { err.textContent = `"${inp.value}" não está entre os golpes que este Pokémon aprende.`; return; }
      if (moves.includes(mv.id)) { err.textContent = "Há golpes repetidos."; return; }
      moves.push(mv.id);
    }
    try {
      await api.updateMember(team.id, m.id, {
        nickname: val("nick").trim() || null, level: level(), nature: val("nature"),
        ability_id: Number(val("ability")) || null, item_id: itemId, ivs, evs, moves,
      });
      await load();
      drawTab();
    } catch (e2) { err.textContent = errorMessage(e2); }
  };
  recalc();
}

// ---------- página ----------
async function main() {
  await boot("");
  const box = app();
  if (!Number.isInteger(teamId)) { box.innerHTML = `<p class="error">Time não encontrado.</p>`; return; }
  try { await load(); } catch (e) {
    box.innerHTML = `<p class="error">${esc(errorMessage(e))}</p><p><a class="btn" href="/">← Voltar</a></p>`;
    return;
  }

  const loggedIn = session.user !== null;
  box.innerHTML = `<section>
    <button id="back">← Voltar</button>
    <div class="detail-head"><h2>${esc(team.name)}</h2>
      <span class="badge ${team.is_public ? "" : "badge-private"}">${team.is_public ? "Público" : "Privado"}</span>
      ${!team.is_owner && loggedIn ? `<button class="primary" id="copy">Salvar cópia nos meus times</button>` : ""}</div>
    ${team.description ? `<p class="muted">${esc(team.description)}</p>` : ""}
    ${!team.is_owner && !loggedIn ? `<p class="muted">Entre na sua conta para salvar uma cópia deste time.</p>` : ""}
    <p id="notice"></p>
    <div class="tabs"><button data-tab="build">Pokémon e builds (${team.members.length}/${MAX_MEMBERS})</button><button data-tab="analysis">Avaliação do time</button></div>
    <div id="panel"></div></section>`;

  $("#back")!.onclick = () => history.back();
  $("#copy")?.addEventListener("click", async () => {
    try {
      const copy = await api.copyTeam(teamId);
      notice(`Time salvo como "${copy.name}". Você encontra em "Meus times" (a cópia começa privada).`, "success");
    } catch (e) { notice(errorMessage(e), "error"); }
  });
  document.querySelectorAll<HTMLElement>("[data-tab]").forEach((b) => {
    b.onclick = () => { tab = b.dataset.tab as "build" | "analysis"; drawTab(); };
  });
  panel().onclick = async (e) => {
    const t = e.target as HTMLElement;
    if (t.closest("#add")) { await drawPicker(); return; }
    const edit = t.closest<HTMLElement>("[data-edit]");
    if (edit) { const m = team.members.find((x) => x.id === Number(edit.dataset.edit)); if (m) await drawEditor(m); return; }
    const rem = t.closest<HTMLElement>("[data-remove]");
    if (rem) {
      const m = team.members.find((x) => x.id === Number(rem.dataset.remove));
      if (!m || !confirm(`Remover ${m.nickname ?? prettyName(m.name)} do time?`)) return;
      try { await api.removeMember(teamId, m.id); await load(); drawTab(); } catch (err) { notice(errorMessage(err), "error"); }
    }
  };
  drawTab();
}
void main();