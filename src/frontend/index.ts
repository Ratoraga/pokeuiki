import { api, errorMessage, session } from "./api";
import { app, authForm, boot, teamCardHtml, $ } from "./common";

async function main() {
  await boot("/");
  const box = app();
  const user = session.user;
  if (!user) { authForm(box, () => location.reload()); return; }

  box.innerHTML = `<section><h2>Meus times</h2><p class="muted" id="msg">Carregando...</p><div class="grid" id="list"></div></section>`;
  const msg = $("#msg")!, list = $("#list")!;
  try {
    const teams = await api.teamsOfUser(user.username);
    msg.textContent = teams.length ? "" : 'Você ainda não criou nenhum time. Use "Criar time" no topo.';
    list.innerHTML = teams.map((t) => teamCardHtml(t, { open: true, del: true })).join("");
  } catch (e) {
    msg.className = "error";
    msg.textContent = errorMessage(e);
  }

  list.onclick = async (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLElement>("[data-del]");
    if (!btn || !confirm("Apagar este time?")) return;
    try {
      await api.deleteTeam(Number(btn.dataset.del));
      btn.closest("article")?.remove();
    } catch (err) {
      msg.className = "error";
      msg.textContent = errorMessage(err);
    }
  };
}
void main();