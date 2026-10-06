// Every mark on the schedule wall: the word, the glyph and what it means. Colour is never the only cue.
import { GLYPH } from "../../ui/primitives.tsx";

export type LegendEntry = { word: string; glyph: string; meaning: string };

export const LEGEND: LegendEntry[] = [
  { word: "Needs more", glyph: GLYPH.open, meaning: "The store has fewer pharmacists than it needs that day. The number says how many more." },
  { word: "Short, accepted", glyph: GLYPH.short, meaning: "You decided to run that day short. It no longer counts as a gap." },
  { word: "Problem", glyph: GLYPH.serious, meaning: "A rule that decides coverage is broken (not licensed, not available, store closed, booked twice). That person does not count toward the store." },
  { word: "Warning", glyph: GLYPH.warning, meaning: "A policy is broken (long drive, too many days in a row). The person still counts." },
  { word: "Cannot fully check", glyph: GLYPH.info, meaning: "Something needed to check the person is not recorded (usually licenses or a drive time). They count, and the mark stays until it is filled in." },
  { word: "Fine", glyph: GLYPH.ok, meaning: "Covered, with nothing to look at." },
  { word: "Pinned", glyph: GLYPH.pin, meaning: "You held this person in place. The engine never moves a pinned assignment." },
  { word: "Locum", glyph: GLYPH.locum, meaning: "An outside locum covers a shift. It counts toward the store." },
];
