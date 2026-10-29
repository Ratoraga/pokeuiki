import { STAT_KEYS, STAT_LABELS } from "../shared/stats";
import { esc, typeBadge } from "./common";
import { prettyName } from "./format";
import type { Analysis } from "./types";

export function analysisHtml(a: Analysis): string {
  const { members, highest, average, defense, offense } = a;
  if (members.length === 0) return `<p class="muted">Adicione Pokémon ao time para ver a avaliação.</p>`;

  const nameOf = (id: number) => {
    const m = members.find((x) => x.id === id);
    return m ? (m.nickname ?? prettyName(m.species)) : "?";
  };
  const weak = defense
    .filter((d) => d.weak > d.resist + d.immune)
    .sort((x, y) => y.weak - y.resist - y.immune - (x.weak - x.resist - x.immune));
  const c = offense.combos;
  const pct = c.total > 0 ? Math.round((c.covered / c.total) * 100) : 0;
  const withNotes = members.filter((m) => m.notes.length > 0);
  const badges = (types: string[]) => types.map((t) => typeBadge(t)).join("");

  const summary = `<div class="card"><h3>Resumo</h3><ul class="summary">
    <li><strong>Fraquezas do time:</strong> ${weak.length === 0 ? `<span class="muted">nenhum tipo pesa contra o time.</span>` : weak.map((w) => typeBadge(w.type, w.weak)).join("")}</li>
    <li><strong>Cobertura ofensiva:</strong> acerta com vantagem ${c.covered} de ${c.total} combinações de tipos (${pct}%).</li>
    <li><strong>Maiores status:</strong><ul class="leaders">${STAT_KEYS.map((k) => {
      const t = highest[k];
      return `<li>${STAT_LABELS[k]}: <strong>${t ? t.value : "—"}</strong>${t ? `<span class="muted"> (${esc(nameOf(t.member_id))})</span>` : ""}</li>`;
    }).join("")}</ul></li></ul></div>`;

  const defRows = defense.map((d) => {
    const covered = d.resist + d.immune;
    const status = d.weak > covered ? "bad" : covered > d.weak ? "good" : "";
    const label = status === "bad" ? "Fraqueza" : status === "good" ? "Coberto" : "Equilibrado";
    return `<tr class="${status ? `row-${status}` : ""}"><td>${typeBadge(d.type)}</td><td>${d.weak}</td><td>${d.resist}</td><td>${d.immune}</td><td>${label}</td></tr>`;
  }).join("");
  const defCard = `<div class="card"><h3>Defesa: contra cada tipo de ataque</h3><div class="table-wrap"><table class="data-table">
    <thead><tr><th>Tipo</th><th>Fracos</th><th>Resistem</th><th>Imunes</th><th>Situação</th></tr></thead><tbody>${defRows}</tbody></table></div>
    <p class="muted">Tipos duplos, habilidades (Levitate, Flash Fire, Water Absorb...) e itens como Air Balloon já entram na conta.</p></div>`;

  const atkCard = `<div class="card"><h3>Ataque: o que o time acerta</h3>
    <p><strong>Tipos dos seus ataques:</strong> ${badges(offense.attackTypes)}</p>
    <p><strong>Contra tipos únicos:</strong> super efetivo em ${offense.superEffective.length} de 18.
      ${offense.notCovered.length > 0 ? `<span class="muted">Sem cobertura: </span>${badges(offense.notCovered)}` : ""}</p>
    <p><strong>Contra tipos duplos e únicos existentes:</strong> ${c.covered} de ${c.total} combinações (${pct}%).</p>
    ${c.uncovered.length > 0 ? `<details><summary>Ver as ${c.uncovered.length} combinações sem golpe super efetivo</summary>
      <div class="combos">${c.uncovered.map((combo) => `<span class="combo">${badges(combo)}</span>`).join("")}</div></details>` : ""}
    ${offense.stabFallback.length > 0 ? `<p class="muted">${esc(offense.stabFallback.map(nameOf).join(", "))} ainda não ${offense.stabFallback.length === 1 ? "tem" : "têm"} golpes de ataque definidos, então considerei os tipos do próprio Pokémon (STAB).</p>` : ""}</div>`;

  const statRows = members.map((m) => `<tr><td>${esc(m.nickname ?? prettyName(m.species))}</td>
    ${STAT_KEYS.map((k) => `<td class="${highest[k]?.member_id === m.id ? "leader" : ""}">${m.stats[k]}</td>`).join("")}<td>${m.total}</td></tr>`).join("");
  const statCard = `<div class="card"><h3>Status finais</h3><div class="table-wrap"><table class="data-table">
    <thead><tr><th>Pokémon</th>${STAT_KEYS.map((k) => `<th>${STAT_LABELS[k]}</th>`).join("")}<th>Total</th></tr></thead>
    <tbody>${statRows}<tr class="avg"><td>Média do time</td>${STAT_KEYS.map((k) => `<td>${average[k]}</td>`).join("")}<td>—</td></tr></tbody></table></div>
    <p class="muted">Considera nível, natureza, IVs, EVs e os bônus diretos de itens e habilidades. Em destaque, o maior valor do time em cada status.</p></div>`;

  const effects = withNotes.length === 0 ? "" : `<div class="card"><h3>Efeitos de itens e habilidades considerados</h3><ul class="effects">
    ${withNotes.map((m) => `<li><strong>${esc(m.nickname ?? prettyName(m.species))}:</strong> ${esc(m.notes.join(" · "))}</li>`).join("")}</ul></div>`;

  return `<div class="analysis">${summary}${defCard}${atkCard}${statCard}${effects}</div>`;
}