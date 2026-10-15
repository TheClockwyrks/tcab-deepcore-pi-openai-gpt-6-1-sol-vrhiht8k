import * as C from "./constants";
import {
  type ReadState,
  type DeepcoreState,
  type Rect,
  slots,
  maxFuel,
  maxHull,
  buildings,
} from "./model";
import * as T from "./transactions";
export function menuItems(s: ReadState): readonly string[] {
  switch (s.screen) {
    case "title":
      return s.saveData ? C.TITLE_ITEMS : C.TITLE_ITEMS.slice(1);
    case "mode-select":
      return C.MODE_ITEMS;
    case "size-select":
      return C.SIZE_ITEMS;
    case "how-to-play":
      return C.HOW_TO_PLAY_ITEMS;
    case "paused":
      return C.PAUSE_ITEMS;
    case "victory":
      return C.VICTORY_ITEMS;
    case "game-over":
      return s.mode === "standard" && s.saveData
        ? C.GAME_OVER_SAVE_ITEMS
        : C.GAME_OVER_ITEMS;
    default:
      return [];
  }
}
export function menuItemRect(s: ReadState, index: number): Rect | null {
  if (!Number.isInteger(index) || index < 0 || index >= menuItems(s).length)
    return null;
  if (s.screen === "title")
    return { x: 88, y: 397 + index * 65, w: 390, h: 52 };
  if (s.screen === "how-to-play") return { x: 96, y: 626, w: 240, h: 48 };
  return { x: 400, y: 310 + index * 72, w: 480, h: 58 };
}
export interface Control extends Rect {
  id: string;
  control: string;
  subject: string | null;
  label: string;
  detail: string;
  enabled: boolean;
}
export function controls(s: ReadState): Control[] {
  if (s.screen !== "in-mine") return [];
  const out: Control[] = [];
  const add = (
    control: string,
    subject: string | null,
    label: string,
    detail: string,
    enabled = true,
  ) => {
    const i = out.filter(
      (c) => !["inventory", "pause", "mute"].includes(c.control),
    ).length;
    out.push({
      id: control + (subject ? ":" + subject : ""),
      control,
      subject,
      label,
      detail,
      enabled,
      x: 220,
      y: 203 + i * 49,
      w: 840,
      h: 42,
    });
  };
  out.push(
    ...["inventory", "pause", "mute"].map((control, i) => ({
      id: control,
      control,
      subject: null,
      label:
        control === "inventory"
          ? "[I] BAY"
          : control === "pause"
            ? "Ⅱ"
            : s.muted
              ? "♪ OFF"
              : "♪",
      detail: "",
      enabled: true,
      x: 1020 + i * 80,
      y: 10,
      w: 72,
      h: 36,
    })),
  );
  if (s.panel === "fuel-depot") {
    add(
      "buy-fuel",
      null,
      `FUEL +${C.FUEL_BUY_INCREMENT}`,
      `${C.FUEL_PRICE} CR / UNIT`,
      s.credits > 0 && s.miner.fuel < maxFuel(s),
    );
    add(
      "fill-fuel",
      null,
      "FILL TANK",
      `${Math.ceil((maxFuel(s) - s.miner.fuel) * C.FUEL_PRICE)} CR TO FULL`,
      s.credits > 0 && s.miner.fuel < maxFuel(s),
    );
    add(
      "buy-repair",
      null,
      `REPAIR +${C.REPAIR_BUY_INCREMENT}`,
      `${C.REPAIR_PRICE} CR / POINT`,
      s.credits > 0 && s.miner.hull < maxHull(s),
    );
    add(
      "repair-full",
      null,
      "FULL REPAIR",
      `${Math.ceil((maxHull(s) - s.miner.hull) * C.REPAIR_PRICE)} CR TO FULL`,
      s.credits > 0 && s.miner.hull < maxHull(s),
    );
  }
  if (s.panel === "ore-market")
    add(
      "sell",
      null,
      C.SELL,
      `${C.MINERALS.reduce((a, m) => a + (s.cargo[m.id] ?? 0) * m.value, 0).toLocaleString()} CR`,
      slots(s) > 0,
    );
  if (s.panel === "upgrade-shop")
    for (const track of C.TRACKS) {
      const tier = s.tiers[track],
        price = C.UPGRADE_PRICES[tier - 1];
      const effect =
        track === "fuel"
          ? `${C.FUEL_TIERS[tier] ?? maxFuel(s)} capacity`
          : track === "cargo"
            ? `${C.CARGO_TIERS[tier] ?? C.CARGO_TIERS[tier - 1]} slots`
            : track === "hull"
              ? `${C.HULL_TIERS[tier] ?? maxHull(s)} hull`
              : track === "jetpack"
                ? `${C.JETPACK_TIERS[Math.min(tier, 4)].liftLimitKg} kg lift`
                : track === "scanner"
                  ? `${C.SCANNER_TIERS[Math.min(tier, 2)]} tile range`
                  : track === "radiator"
                    ? `${Math.round(C.RADIATOR_TIERS[Math.min(tier, 4)] * 100)}% heat resistance`
                    : `power ${Math.min(tier + 1, 5)}`;
      add(
        "buy-upgrade",
        track,
        `${track.toUpperCase()} / T${tier}`,
        tier >= C.MAX_TIER[track] ? "MAXED" : `→ ${effect}    ${price} CR`,
        tier < C.MAX_TIER[track] && s.credits >= price,
      );
    }
  if (s.panel === "supply-depot")
    for (const item of C.ITEMS)
      add(
        "buy-item",
        item.id,
        item.name.toUpperCase(),
        `${item.price} CR / HELD ${s.items[item.id]}`,
        s.credits >= item.price,
      );
  if (s.panel === "launch-pad") {
    const p = C.ROCKET_COMPONENTS[s.rocket];
    if (p)
      add(
        "fabricate",
        null,
        C.FABRICATE,
        `${p.name} / ${p.credits} CR${p.material ? " + " + p.material.toUpperCase() : ""}`,
        s.credits >= p.credits &&
          (!p.material ||
            (p.material === "core-sample"
              ? s.satchel.coreSample
              : s.satchel[p.material] > 0)),
      );
    else add("launch", null, C.LAUNCH, "ALL SYSTEMS NOMINAL");
  }
  if (s.panel === "inventory") {
    let i = 0;
    for (const m of C.MINERALS)
      if (s.cargo[m.id]) {
        out.push({
          id: "drop-ore:" + m.id,
          control: "drop-ore",
          subject: m.id,
          label: `${m.name} ×${s.cargo[m.id]}`,
          detail: `${(s.cargo[m.id] ?? 0) * m.weightKg} kg / DROP 1`,
          enabled: true,
          x: 210,
          y: 205 + i * 30,
          w: 390,
          h: 27,
        });
        i++;
      }
    C.ITEMS.forEach((item, i) =>
      out.push({
        id: "use-item:" + item.id,
        control: "use-item",
        subject: item.id,
        label: `${i + 1} / ${item.name}`,
        detail: `×${s.items[item.id]}  ${C.USE}`,
        enabled: s.items[item.id] > 0,
        x: 650,
        y: 205 + i * 49,
        w: 420,
        h: 42,
      }),
    );
    if (s.satchel.coreSample)
      out.push({
        id: "jettison",
        control: "jettison",
        subject: null,
        label: C.JETTISON,
        detail: "[J] CORE SAMPLE",
        enabled: true,
        x: 650,
        y: 520,
        w: 420,
        h: 42,
      });
  }
  if (s.notice && s.notice.age >= C.NOTICE_DELAY)
    out.push({
      id: "dismiss-notice",
      control: "dismiss-notice",
      subject: null,
      label: "",
      detail: "",
      enabled: true,
      x: 30,
      y: 548,
      w: 620,
      h: 105,
    });
  return out;
}
export function controlRect(
  s: ReadState,
  control: string,
  subject: string | null,
): Rect | null {
  const c = controls(s).find(
    (c) => c.control === control && c.subject === subject,
  );
  return c ? { x: c.x, y: c.y, w: c.w, h: c.h } : null;
}
export function hit(r: Rect, x: number, y: number) {
  return x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h;
}
export function changeScreen(
  s: DeepcoreState,
  screen: C.ScreenName,
  index = 0,
) {
  s.screen = screen;
  s.menuIndex = index;
}
export function choose(s: DeepcoreState): DeepcoreState {
  const item = menuItems(s)[s.menuIndex];
  switch (s.screen) {
    case "title":
      if (item === "CONTINUE") return T.restore(s);
      changeScreen(s, item === "HOW TO PLAY" ? "how-to-play" : "mode-select");
      break;
    case "mode-select":
      if (item === "BACK") back(s);
      else {
        s.mode = s.menuIndex === 0 ? "standard" : "hardcore";
        changeScreen(s, "size-select");
      }
      break;
    case "size-select":
      if (item === "BACK") back(s);
      else {
        s.worldSize = C.WORLD_SIZES[s.menuIndex];
        return T.start(s);
      }
      break;
    case "how-to-play":
      back(s);
      break;
    case "paused":
      if (item === "RESUME") changeScreen(s, "in-mine");
      else if (item === "RESTART") return T.start(s);
      else changeScreen(s, "title", s.saveData ? 1 : 0);
      break;
    case "victory":
    case "game-over":
      if (item === "CONTINUE FROM SAVE") return T.restore(s);
      if (item === "PLAY AGAIN") return T.start(s);
      changeScreen(s, "title", s.saveData ? 1 : 0);
      break;
  }
  return s;
}
export function back(s: DeepcoreState) {
  if (s.screen === "paused") changeScreen(s, "in-mine");
  else if (s.screen === "size-select")
    changeScreen(s, "mode-select", C.MODES.indexOf(s.mode));
  else if (s.screen === "mode-select")
    changeScreen(s, "title", s.saveData ? 1 : 0);
  else if (s.screen === "how-to-play")
    changeScreen(s, "title", s.saveData ? 2 : 1);
  else if (s.screen === "in-mine") {
    if (s.panel) {
      s.panel = null;
      s.panelIndex = 0;
    } else changeScreen(s, "paused");
  }
}
export function activateBuilding(s: DeepcoreState, id: C.BuildingId) {
  if (id === "save-pad") T.save(s);
  else {
    s.panel = id;
    s.panelIndex = 0;
  }
}
export function nearbyBuilding(s: ReadState) {
  if (s.miner.y + C.MINER_H > C.SURFACE_Y + 0.5) return null;
  const mx = s.miner.x + C.MINER_W / 2;
  return (
    buildings.find(
      (b) =>
        mx >= b.x - 15 && mx <= b.x + b.w + 15 && s.miner.y + C.MINER_H > b.y,
    ) ?? null
  );
}
export function act(s: DeepcoreState, control: string, subject: string | null) {
  switch (control) {
    case "inventory":
      s.panel = s.panel === "inventory" ? null : "inventory";
      s.panelIndex = 0;
      break;
    case "pause":
      back(s);
      break;
    case "mute":
      s.muted = !s.muted;
      break;
    case "sell":
      T.sell(s);
      break;
    case "buy-fuel":
      T.buyResource(s, "fuel", false);
      break;
    case "fill-fuel":
      T.buyResource(s, "fuel", true);
      break;
    case "buy-repair":
      T.buyResource(s, "hull", false);
      break;
    case "repair-full":
      T.buyResource(s, "hull", true);
      break;
    case "buy-upgrade":
      T.buyUpgrade(s, subject as C.TrackName);
      break;
    case "buy-item":
      T.buyItem(s, subject as C.ItemId);
      break;
    case "use-item":
      T.useItem(s, subject as C.ItemId);
      break;
    case "drop-ore":
      if (s.cargo[subject as C.OreId]) s.cargo[subject as C.OreId]!--;
      break;
    case "fabricate":
      T.fabricate(s);
      break;
    case "launch":
      T.launch(s);
      break;
    case "jettison":
      T.jettison(s);
      break;
    case "dismiss-notice":
      s.notice = null;
      break;
  }
}
