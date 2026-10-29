import { api, errorMessage } from "./api";
import { $, app, boot, esc, teamCardHtml } from "./common";

async function main() {
  await boot("/explorar");
  app().innerHTML = `<section><h2>Explorar usuários</h2>
    <form class="search" id="f"><input id="q" placeholder="Nome de usuário (ex: ash)"><button class="primary">Buscar</button></form>
    <p class="error" id="err"></p><div id="out"></div></section>`;

  $<HTMLFormElement>("#f")!.onsubmit = async (e) => {
    e.preventDefault();
    const name = $<HTMLInputElement>("#q")!.value.trim();
    if (!name) return;
    $("#err")!.textContent = "";
    $("#out")!.innerHTML = "";
    try {
      const teams = await api.teamsOfUser(name);
      $("#out")!.innerHTML = `<h3>Times de ${esc(name)}</h3>
        ${teams.length === 0 ? `<p class="muted">Nenhum time público encontrado.</p>` : ""}
        <div class="grid">${teams.map((t) => teamCardHtml(t, { open: true })).join("")}</div>`;
    } catch (err) {
      $("#err")!.textContent = errorMessage(err);
    }
  };
}
void main();