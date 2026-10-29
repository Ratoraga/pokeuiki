export function prettyName(slug: string): string {
  return slug
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export const TYPE_PT: Record<string, string> = {
  stellar: "Estelar", normal: "Normal", fire: "Fogo", water: "Água", electric: "Elétrico", grass: "Planta",
  ice: "Gelo", fighting: "Lutador", poison: "Veneno", ground: "Terra", flying: "Voador",
  psychic: "Psíquico", bug: "Inseto", rock: "Pedra", ghost: "Fantasma", dragon: "Dragão",
  dark: "Sombrio", steel: "Aço", fairy: "Fada",
};

export const TYPE_COLORS: Record<string, string> = {
  stellar: "#40b5a5", normal: "#a8a77a", fire: "#ee8130", water: "#6390f0", electric: "#d9a800", grass: "#5fa83a",
  ice: "#74bfbb", fighting: "#c22e28", poison: "#a33ea1", ground: "#c9a43f", flying: "#8d73e0",
  psychic: "#f95587", bug: "#8c9b13", rock: "#a08c2c", ghost: "#735797", dragon: "#6f35fc",
  dark: "#705746", steel: "#8d8da8", fairy: "#d685ad",
};

export const typeLabel = (type: string) => TYPE_PT[type] ?? prettyName(type);

export const isBattleOnlyForm = (name: string) => /-(mega|gmax|primal|eternamax|totem)(-|$)/.test(name);