// ───────────────────────────────────────────────────────────────────
//  settings/tour.js — Settings → About: "Show Welcome Tour" replays the
//  first-run tour (components/onboarding.js) through the menu action.
// ───────────────────────────────────────────────────────────────────
import { bus } from "../../core/bus.js"
import { group, row, btn } from "./kit.js"

export function catTour () {
  return [group("Getting started", [
    row("Welcome tour", btn("Show Welcome Tour", () => bus.emit("menu", { action: "welcome" })),
      "Walk through looks, layout, your Home and the best shortcuts again. Also in Help → Welcome Tour…")
  ])]
}
