import { api, errorMessage, session } from "./api";
import { TYPE_COLORS, prettyName, typeLabel } from "./format";
import { registerSprites, spriteUrl, type Team } from "./types";

export const $ = <T extends HTMLElement = HTMLElement>(sel: string, root: ParentNode = document): T | null =>
  root.querySelector<T>(sel);
export const app = (): HTMLElement => document.getElementById("app")!;

const ESC: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

export const esc = (v: unknown): string => String(v ?? "").replace(/[&<>"']/g, (c) => ESC[c] ?? c);

export const typeBadge = (type: string, count?: number): string =>
  `<span class="type" style="background:${TYPE_COLORS[type] ?? "#888"}">${esc(typeLabel(type))}${count !== undefined ? ` ×${count}` : ""}</span>`;

export const img = (pokemonId: number, size = 72): string =>
  `<img src="${esc(spriteUrl(pokemonId))}" alt="" width="${size}" height="${size}" loading="lazy">`;

export function teamCardHtml(t: Team, opts: { open?: boolean; del?: boolean } = {}): string {
  const slots = t.pokemon.length === 0
    ? `<p class="muted">Time sem Pokémon.</p>`
    : `<ul class="slots">${t.pokemon.map((p) => `<li>${img(p.pokemon_id)}<span>${esc(p.nickname ?? prettyName(p.name))}</span></li>`).join("")}</ul>`;
  return `<article class="card">
    <div class="card-head"><h3>${esc(t.name)}</h3><span class="badge ${t.is_public ? "" : "badge-private"}">${t.is_public ? "Público" : "Privado"}</span></div>
    ${t.description ? `<p class="muted">${esc(t.description)}</p>` : ""}
    ${slots}
    <div class="actions">
      ${opts.open ? `<a class="btn primary" href="/time?id=${t.id}">Abrir time</a>` : ""}
      ${opts.del ? `<button class="danger" data-del="${t.id}">Apagar</button>` : ""}
    </div></article>`;
}

export function authForm(box: HTMLElement, onDone: () => void): void {
  let mode: "login" | "register" = "login";
  const draw = (error = "", busy = false) => {
    box.innerHTML = `<form class="card form" id="auth">
      <h2>${mode === "login" ? "Entrar" : "Criar conta"}</h2>
      ${mode === "register" ? `<label>Nome de usuário<input name="username" required></label>` : ""}
      <label>E-mail<input name="email" type="email" required></label>
      <label>Senha<input name="password" type="password" required></label>
      ${error ? `<p class="error">${esc(error)}</p>` : ""}
      <button class="primary" ${busy ? "disabled" : ""}>${busy ? "Aguarde..." : mode === "login" ? "Entrar" : "Cadastrar"}</button>
      <button type="button" class="link" id="toggle">${mode === "login" ? "Não tem conta? Cadastre-se" : "Já tem conta? Entrar"}</button>
    </form>`;
    $("#toggle", box)!.onclick = () => { mode = mode === "login" ? "register" : "login"; draw(); };
    $<HTMLFormElement>("#auth", box)!.onsubmit = async (e) => {
      e.preventDefault();
      const f = new FormData(e.target as HTMLFormElement);
      const email = String(f.get("email") ?? "");
      const password = String(f.get("password") ?? "");
      draw("", true);
      try {
        if (mode === "register") await api.register(String(f.get("username") ?? ""), email, password);
        const { token, user } = await api.login(email, password);
        session.save(token, user);
        onDone();
      } catch (err) {
        draw(errorMessage(err));
      }
    };
  };
  draw();
}

const NAV: [string, string][] = [
  ["/", "Meus times"], ["/criar", "Criar time"], ["/explorar", "Explorar usuários"],
  ["/batalha", "Batalha"], ["/pokedex", "Pokédex"],
];
const PLACEHOLDER =
  "data:image/svg+xml," +
  encodeURIComponent("<svg xmlns='http://www.w3.org/2000/svg' width='96' height='96'><text x='50%' y='60%' font-size='56' text-anchor='middle' fill='#999'>?</text></svg>");

export async function boot(active: string): Promise<void> {
  const user = session.user;
  document.getElementById("header")!.innerHTML = `<h1>PokéWiki</h1><nav>
    ${NAV.map(([href, label]) => `<a class="btn ${href === active ? "active" : ""}" href="${href}">${label}</a>`).join("")}
    ${user ? `<button class="ghost" id="logout">Sair (${esc(user.username)})</button>` : ""}</nav>`;
  $("#logout")?.addEventListener("click", () => { session.clear(); location.href = "/"; });

  window.addEventListener("pokewiki:logout", () => { location.href = "/"; });
  window.addEventListener("error", (e) => {
    const t = e.target;
    if (t instanceof HTMLImageElement && !t.dataset.fallback) { t.dataset.fallback = "1"; t.src = PLACEHOLDER; }
  }, true);

  try { registerSprites(await api.listPokemon()); } catch { } // segue sem os sprites do banco
}