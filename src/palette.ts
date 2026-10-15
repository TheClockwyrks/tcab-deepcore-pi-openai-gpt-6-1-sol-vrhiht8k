import type { BandName, OreId } from "./constants";

export const BAND_COLORS: Record<BandName, string> = {
  topsoil: "#ad8d6e",
  rockbed: "#a7b2b0",
  deepstone: "#718f9e",
  coreshell: "#bd7b67",
};
const MINERAL_COLORS: Record<OreId, string> = {
  ferron: "#c8a790",
  marlite: "#d5c478",
  cuprite: "#e68758",
  argenite: "#d5e3e0",
  cobaltine: "#689ee1",
  voltite: "#78dfdb",
  halcite: "#c7c5ef",
  pyronium: "#ef9c54",
  cindrite: "#ed6b67",
  adamite: "#9ee7ff",
  verdite: "#83ebac",
  roselite: "#f19dc5",
  aurite: "#f7dc8b",
};
export function mineralColor(id: string): string {
  return MINERAL_COLORS[id as OreId] ?? "#8ad8c7";
}
