import { TYPES } from "../shared/pokemonTypes";
import { STAT_KEYS, STAT_LABELS } from "../shared/stats";
import { api, errorMessage } from "./api";
import { $, app, boot, esc, img, typeBadge } from "./common";
import { prettyName, typeLabel } from "./format";
import type { Move, Pokemon, PokemonDetail } from "./types";

const GENERATIONS = [
  { label: "Geração 1", from: 1, to: 151 }, { label: "Geração 2", from: 152, to: 251 },
  { label: "Geração 3", from: 252, to: 386 }, { label: "Geração 4", from: 387, to: 493 },
  { label: "Geração 5", from: 494, to: 649 }, { label: "Geração 6", from: 650, to: 721 },
  { label: "Geração 7", from: 722, to: 809 }, { label: "Geração 8", from: 810, to: 905 },
  { label: "Geração 9", from: 906, to: 1025 }, { label: "Formas alternativas", from: 10000, to: 99999 },
];
const CLASS_LABEL: Record<string, string> = { physical: "Físico", special: "Especial", status: "Status" };

let catalog: Pokemon[] = [];
let filter = "", type = "", gen = -1, mode: "pages" | "scroll" = "pages", pageSize = 24, page = 1, visible = 48;
let observer: IntersectionObserver | null = null;

const filtered = (): Pokemon[] => {
  const term = filter.trim().toLowerCase().replaceAll(" ", "-");
  const g = GENERATIONS[gen];
  return catalog.filter((p) =>
    (!term || p.name.includes(term) || String(p.id) === term) &&
    (!type || p.type1 === type || p.type2 === type) &&
    (!g || (p.id >= g.from && p.id <= g.to)));
};

function drawGrid() {
  const list = filtered();
  const totalPages = Math.max(1, Math.ceil(list.length / pageSize));
  page = Math.min(page, totalPages);
  const items = mode === "pages" ? list.slice((page - 1) * pageSize, page * pageSize) : list.slice(0, visible);

  $("#total")!.textContent = `${list.length} Pokémon`;
  $("#grid")!.innerHTML = items.map((p) => `<button class="dex-card" data-id="${p.id}">${img(p.id, 96)}
    <span class="muted small">#${p.id}</span><strong>${esc(prettyName(p.name))}</strong>
    <span>${typeBadge(p.type1)}${p.type2 ? typeBadge(p.type2) : ""}</span></button>`).join("")
    + (list.length === 0 && catalog.length > 0 ? `<p class="muted">Nenhum Pokémon com esses filtros.</p>` : "");

  observer?.disconnect();
  if (mode === "pages") {
    $("#pager")!.innerHTML = `<div class="pager">
      <button data-page="1" ${page <= 1 ? "disabled" : ""}>« Primeira</button>
      <button data-page="${page - 1}" ${page <= 1 ? "disabled" : ""}>‹ Anterior</button>
      <span>Página <input type="number" id="pg" min="1" max="${totalPages}" value="${page}"> de ${totalPages}</span>
      <button data-page="${page + 1}" ${page >= totalPages ? "disabled" : ""}>Próxima ›</button>
      <button data-page="${totalPages}" ${page >= totalPages ? "disabled" : ""}>Última »</button></div>`;
  } else {
    $("#pager")!.innerHTML = `<div id="sentinel"></div><p class="muted center-text">${visible < list.length ? "Carregando mais ao rolar..." : "Fim da lista."}</p>`;
    observer = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting) && visible < filtered().length) { visible += 48; drawGrid(); }
    }, { rootMargin: "400px" });
    observer.observe($("#sentinel")!);
  }
}

function drawList() {
  const box = app();
  box.innerHTML = `<section><h2>Pokédex</h2><p class="error" id="err"></p>
    <div class="card dex-controls">
      <input id="q" placeholder="Buscar por nome ou número (opcional)..." value="${esc(filter)}">
      <select id="gen"><option value="-1">Todas as gerações</option>${GENERATIONS.map((g, i) => `<option value="${i}">${g.label}</option>`).join("")}</select>
      <select id="type"><option value="">Todos os tipos</option>${TYPES.map((t) => `<option value="${t}">${esc(typeLabel(t))}</option>`).join("")}</select>
      <select id="mode"><option value="pages">Páginas</option><option value="scroll">Rolagem infinita</option></select>
      <select id="size">${[24, 48, 96].map((n) => `<option value="${n}">${n} por página</option>`).join("")}</select>
      <span class="muted small" id="total"></span></div>
    <div class="dex-grid" id="grid"></div><div id="pager"></div></section>`;
  $<HTMLSelectElement>("#gen")!.value = String(gen);
  $<HTMLSelectElement>("#type")!.value = type;
  $<HTMLSelectElement>("#mode")!.value = mode;
  $<HTMLSelectElement>("#size")!.value = String(pageSize);
  $<HTMLSelectElement>("#size")!.style.display = mode === "pages" ? "" : "none";

  const reset = () => { page = 1; visible = 48; drawGrid(); };
  $("#q")!.oninput = (e) => { filter = (e.target as HTMLInputElement).value; reset(); };
  $("#gen")!.onchange = (e) => { gen = Number((e.target as HTMLSelectElement).value); reset(); };
  $("#type")!.onchange = (e) => { type = (e.target as HTMLSelectElement).value; reset(); };
  $("#mode")!.onchange = (e) => { mode = (e.target as HTMLSelectElement).value as "pages" | "scroll"; $("#size")!.style.display = mode === "pages" ? "" : "none"; reset(); };
  $("#size")!.onchange = (e) => { pageSize = Number((e.target as HTMLSelectElement).value); reset(); };
  $("#grid")!.onclick = (e) => { const b = (e.target as HTMLElement).closest<HTMLElement>("[data-id]"); if (b) void openDetail(Number(b.dataset.id)); };
  $("#pager")!.onclick = (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>("[data-page]");
    if (b && !(b as HTMLButtonElement).disabled) { page = Number(b.dataset.page); drawGrid(); window.scrollTo({ top: 0 }); }
  };
  $("#pager")!.onchange = (e) => {
    const t = e.target as HTMLInputElement;
    if (t.id === "pg") { page = Math.max(1, Number(t.value) || 1); drawGrid(); window.scrollTo({ top: 0 }); }
  };
  drawGrid();
}

async function openDetail(id: number) {
  observer?.disconnect();
  let d: PokemonDetail;
  try { d = await api.getPokemon(id); } catch (e) { $("#err")!.textContent = errorMessage(e); return; }
  const list = filtered();
  const idx = list.findIndex((p) => p.id === id);
  const prev = idx > 0 ? list[idx - 1] : undefined;
  const next = idx >= 0 ? list[idx + 1] : undefined;
  const total = STAT_KEYS.reduce((n, k) => n + d.base[k], 0);

  app().innerHTML = `<section><div class="dex-detail">
    <div class="actions"><button id="back">← Voltar à lista</button>
      <button id="prev" ${prev ? "" : "disabled"}>‹ Anterior</button><button id="next" ${next ? "" : "disabled"}>Próximo ›</button></div>
    <div class="card member-head">${img(d.id, 120)}<div><h2>${esc(prettyName(d.name))} <span class="muted">#${d.id}</span></h2>
      <div class="types">${typeBadge(d.type1)}${d.type2 ? typeBadge(d.type2) : ""}</div>
      <p class="muted small">${d.height !== null ? `${d.height / 10} m` : "—"} · ${d.weight !== null ? `${d.weight / 10} kg` : "—"}</p></div></div>
    <div class="card"><h3>Status base (total ${total})</h3>${STAT_KEYS.map((k) => `<div class="stat-row"><span class="stat-name">${STAT_LABELS[k]}</span>
      <strong class="stat-val">${d.base[k]}</strong><div class="stat-bar"><div style="width:${Math.min(100, (d.base[k] / 255) * 100)}%"></div></div></div>`).join("")}</div>
    <div class="card"><h3>Habilidades</h3><ul class="ability-list">${d.abilities.map((a) => `<li><strong>${esc(prettyName(a.name))}</strong>${a.is_hidden ? ` <span class="badge badge-private">oculta</span>` : ""}
      <div class="muted small">${esc(a.description || "Sem descrição.")}</div></li>`).join("")}</ul></div>
    <div class="card"><h3 id="mtitle"></h3>
      <div class="row dex-filters"><input id="mq" placeholder="Buscar golpe...">
        <select id="mt"><option value="">Todos os tipos</option>${TYPES.map((t) => `<option value="${t}">${esc(typeLabel(t))}</option>`).join("")}</select>
        <select id="mc"><option value="">Todas as categorias</option>${Object.entries(CLASS_LABEL).map(([k, v]) => `<option value="${k}">${v}</option>`).join("")}</select></div>
      <div class="table-wrap dex-moves"><table class="data-table"><thead><tr>
        <th class="sortable" data-sort="name">Golpe</th><th>Tipo</th><th>Cat.</th><th class="sortable" data-sort="power">Poder</th>
        <th class="sortable" data-sort="accuracy">Prec.</th><th class="sortable" data-sort="pp">PP</th><th>Efeito</th></tr></thead><tbody id="mbody"></tbody></table></div></div>
  </div></section>`;

  $("#back")!.onclick = drawList;
  if (prev) $("#prev")!.onclick = () => void openDetail(prev.id);
  if (next) $("#next")!.onclick = () => void openDetail(next.id);
  window.scrollTo({ top: 0 });

  // Movedex
  let sort: "name" | "power" | "accuracy" | "pp" = "name";
  let desc = false;
  const drawMoves = () => {
    const term = $<HTMLInputElement>("#mq")!.value.trim().toLowerCase().replaceAll(" ", "-");
    const t = $<HTMLSelectElement>("#mt")!.value, c = $<HTMLSelectElement>("#mc")!.value;
    const rows = d.moves.filter((m) => m.name.includes(term) && (!t || m.type === t) && (!c || m.damage_class === c));
    const val = (m: Move) => (sort === "name" ? m.name : (m[sort] ?? -1));
    rows.sort((a, b) => {
      const x = val(a), y = val(b);
      const r = typeof x === "string" && typeof y === "string" ? x.localeCompare(y) : Number(x) - Number(y);
      return desc ? -r : r;
    });
    $("#mtitle")!.textContent = `Movedex (${rows.length} de ${d.moves.length} golpes)`;
    $("#mbody")!.innerHTML = rows.map((m) => `<tr><td>${esc(prettyName(m.name))}</td><td>${typeBadge(m.type)}</td><td>${CLASS_LABEL[m.damage_class] ?? esc(m.damage_class)}</td>
      <td>${m.power ?? "—"}</td><td>${m.accuracy ?? "—"}</td><td>${m.pp ?? "—"}</td><td class="small muted">${esc(m.effect || "—")}</td></tr>`).join("");
  };
  for (const id2 of ["mq", "mt", "mc"]) $(`#${id2}`)!.addEventListener("input", drawMoves);
  document.querySelectorAll<HTMLElement>("[data-sort]").forEach((th) => {
    th.onclick = () => {
      const key = th.dataset.sort as typeof sort;
      if (sort === key) desc = !desc; else { sort = key; desc = false; }
      drawMoves();
    };
  });
  drawMoves();
}

async function main() {
  await boot("/pokedex");
  try { catalog = await api.listPokemon(); } catch { /* a lista fica vazia */ }
  drawList();
}
void main();