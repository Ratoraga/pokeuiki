export type Gender = "M" | "F" | null;

/** gender_rate da PokeAPI: -1 sem gênero, 0 sempre macho, 8 sempre fêmea, 1 a 7 = oitavos de fêmea. */
export function resolveGender(chosen: Gender | undefined, rate: number | null | undefined): Gender {
  if (rate === null || rate === undefined || rate === -1) return null;
  if (rate === 0) return "M";
  if (rate === 8) return "F";
  return chosen ?? (rate > 4 ? "F" : "M");
}

export function genderRel(a: { gender?: Gender }, b: { gender?: Gender }): "same" | "opposite" | "none" {
  const x = a.gender ?? null, y = b.gender ?? null;
  if (!x || !y) return "none";
  return x === y ? "same" : "opposite";
}