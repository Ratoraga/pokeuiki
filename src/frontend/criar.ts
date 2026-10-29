import { api, errorMessage, session } from "./api";
import { $, app, authForm, boot, esc, img } from "./common";
import { isBattleOnlyForm, prettyName } from "./format";
import type { Pokemon } from "./types";

const MAX = 6;
const VISIBLE = 60;

async function main() {
  await boot("/criar");
  const box = app();
  if (!session.user) { authForm(box, () => location.reload()); return; }

  let catalog: Pokemon[] = [];
  let selected: number[] = [];
  let filter = "";

  box.innerHTML = `<form class="card form" id="f">
    <h2>Criar time</h2>
    <label>Nome do time<input id="name" required maxlength="100"></label>
    <label>Descrição (opcional)<textarea id="desc" rows="2"></textarea></label>
    <label class="check"><input type="checkbox" id="pub" checked> Time público (outros usuários podem ver)</label>
    <div><strong id="count"></strong><ol class="chosen" id="chosen"></ol></div>
    <input id="filter" placeholder="Filtrar Pokémon por nome...">
    <p class="muted">Mostrando até ${VISIBLE} resultados. Use o filtro para achar outros Pokémon.</p>
    <div class="catalog" id="catalog"></div>
    <p class="error" id="err"></p>
    <button class="primary" id="save">Salvar time</button></form>`;

  const nameOf = (id: number) => prettyName(catalog.find((p) => p.id === id)?.name ?? "");
  const drawChosen = () => {
    $("#count")!.textContent = `Pokémon escolhidos (${selected.length}/${MAX})`;
    $("#chosen")!.innerHTML = selected.map((id) => `<li>${img(id, 40)}${esc(nameOf(id))}</li>`).join("");
  };
  const drawCatalog = () => {
    const term = filter.trim().toLowerCase().replaceAll(" ", "-");
    const list = catalog.filter((p) => !isBattleOnlyForm(p.name) && p.name.includes(term)).slice(0, VISIBLE);
    $("#catalog")!.innerHTML = list.map((p) =>
      `<button type="button" class="pick ${selected.includes(p.id) ? "picked" : ""}" data-id="${p.id}">${img(p.id, 64)}<span>${esc(prettyName(p.name))}</span></button>`
    ).join("");
  };

  try { catalog = await api.listPokemon(); } catch (e) { $("#err")!.textContent = errorMessage(e); }
  drawChosen(); drawCatalog();

  $<HTMLInputElement>("#filter")!.oninput = (e) => { filter = (e.target as HTMLInputElement).value; drawCatalog(); };
  $("#catalog")!.onclick = (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>("[data-id]");
    if (!b) return;
    const id = Number(b.dataset.id);
    if (selected.includes(id)) selected = selected.filter((x) => x !== id);
    else if (selected.length < MAX) selected = [...selected, id];
    drawChosen(); drawCatalog();
  };
  $<HTMLFormElement>("#f")!.onsubmit = async (e) => {
    e.preventDefault();
    const save = $<HTMLButtonElement>("#save")!;
    save.disabled = true; save.textContent = "Salvando...";
    try {
      await api.createTeam({
        name: $<HTMLInputElement>("#name")!.value.trim(),
        description: $<HTMLTextAreaElement>("#desc")!.value.trim() || undefined,
        is_public: $<HTMLInputElement>("#pub")!.checked,
        pokemon: selected,
      });
      location.href = "/";
    } catch (err) {
      $("#err")!.textContent = errorMessage(err);
      save.disabled = false; save.textContent = "Salvar time";
    }
  };
}
void main();