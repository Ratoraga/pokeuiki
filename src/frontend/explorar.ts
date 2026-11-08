import { api, errorMessage, session, type Contact } from "./api";
import { $, app, boot, esc, teamCardHtml } from "./common";
import type { Team } from "./types";

async function main() {
  await boot("/explorar");
  let tab: "search" | "saved" = "search";
  let contacts: Contact[] = [];
  let query = "";
  let found: { name: string; teams: Team[] } | null = null;
  let error = "";

  const isSaved = (name: string) => contacts.some((c) => c.username.toLowerCase() === name.toLowerCase());
  async function loadContacts() {
    if (!session.user) { contacts = []; return; }
    try { contacts = await api.listContacts(); } catch (e) { error = errorMessage(e); }
  }
  async function search(name: string) {
    error = ""; query = name; found = null;
    try { found = { name, teams: await api.teamsOfUser(name) }; } catch (e) { error = errorMessage(e); }
  }

  function addButton(name: string): string {
    if (!session.user) return `<span class="muted small">Entre na conta para salvar usuários.</span>`;
    if (session.user.username.toLowerCase() === name.toLowerCase()) return "";
    return isSaved(name)
      ? `<button data-act="remove" data-u="${esc(name)}">Remover dos salvos</button>`
      : `<button class="primary" data-act="add" data-u="${esc(name)}">Adicionar usuário</button>`;
  }
  const searchView = () => `<form class="search" id="f"><input id="q" placeholder="Nome de usuário (ex: ash)" value="${esc(query)}"><button class="primary">Buscar</button></form>`
    + (found ? `<h3>Times de ${esc(found.name)} ${addButton(found.name)}</h3>
      ${found.teams.length === 0 ? `<p class="muted">Nenhum time público encontrado.</p>` : ""}
      <div class="grid">${found.teams.map((t) => teamCardHtml(t, { open: true })).join("")}</div>` : "");
  const savedView = () => !session.user
    ? `<p class="muted">Entre na sua conta para ver os usuários salvos.</p>`
    : contacts.length === 0
      ? `<p class="muted">Você ainda não salvou ninguém. Busque um usuário e clique em “Adicionar usuário”.</p>`
      : `<div class="grid">${contacts.map((c) => `<article class="card"><h3>${esc(c.username)}</h3>
          <p class="muted small">${c.public_teams} time(s) público(s)</p>
          <div class="actions"><button class="primary" data-act="open" data-u="${esc(c.username)}">Ver times</button>
          <button data-act="remove" data-u="${esc(c.username)}">Remover</button></div></article>`).join("")}</div>`;

  function draw() {
    app().innerHTML = `<section><h2>Explorar usuários</h2>
      <div class="actions">
        <button class="${tab === "search" ? "primary" : ""}" data-act="tab" data-tab="search">Buscar</button>
        <button class="${tab === "saved" ? "primary" : ""}" data-act="tab" data-tab="saved">Salvos (${contacts.length})</button></div>
      ${error ? `<p class="error">${esc(error)}</p>` : ""}
      ${tab === "search" ? searchView() : savedView()}</section>`;
  }

  app().onclick = async (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>("[data-act]");
    if (!b) return;
    const act = b.dataset.act, u = b.dataset.u ?? "";
    error = "";
    try {
      if (act === "tab") tab = b.dataset.tab === "saved" ? "saved" : "search";
      else if (act === "add") { await api.addContact(u); await loadContacts(); }
      else if (act === "remove") { await api.removeContact(u); await loadContacts(); }
      else if (act === "open") { tab = "search"; await search(u); }
    } catch (err) { error = errorMessage(err); }
    draw();
  };
  app().onsubmit = async (e) => {
    e.preventDefault();
    const name = $<HTMLInputElement>("#q")?.value.trim();
    if (!name) return;
    await search(name);
    draw();
  };

  await loadContacts();
  draw();
}
void main();