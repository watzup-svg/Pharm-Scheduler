# Copy guide

One voice for every word in the app: what is on screen, what appears on hover, what is read out, what toasts say, and what prints. Written for a district manager who is busy and is not a scheduler by training. Agreed 2026-10-02.

## Voice
- **Labels are neutral.** Buttons, tabs, counts and headings name the thing: "Someone’s out", "No coverage", "Time off". No "please", no jokes, no exclamation marks.
- **Guidance is warm and direct.** Sentences that tell you what happened or what to do speak like a calm colleague: "Fenn is free that day." "Nobody is free on Tue Oct 20, so Yara would have to leave Woodland." Lead with the fact, then the consequence, then (if needed) what to do.
- **Never scold, never explain the software.** Say what is true about the schedule, not how the app works.
- **Names: full name when it fits.** "Fenn Ritter". When it won't, use the first initial and the whole last name: "F. Ritter". Never the first name alone. If the name still overflows its box, cut it short with "…". If two people would read the same ("A. Kowal" twice), both keep their full name. One helper does this everywhere (`shortNames` in `day-view.ts`); do not shorten names by hand.

## Words (one name per idea)
| Use | Not |
|---|---|
| store | pharmacy, location (the brand "Hi-School Pharmacy" stays) |
| no coverage | hole, vacancy, open shift (an open store and an open shift are different things) |
| two places | double, double-booked, listed twice |
| name on a closed day | leftover |
| not licensed | license problem, licence mismatch |
| time off | PTO (except the print legend), leave, vacation (unless it is the reason) |
| someone’s out (the button), out (the person) | mark out, call out, absence |
| waiting | pending, requested (as a count) |
| covering | float coverage, away |
| find cover / cover | backfill, replace |
| left as is | accepted, ignored |
| shorter drives | cover plan, optimizer |
| spare (a pharmacist) | slack, buffer |
| schedule (verb), scheduled | place, placed, assign |
| remove (a name from a shift) | clear, delete |
| choose | pick, select |
| fix | resolve, remediate |
| pack | packet, bundle (the set of pages to print) |
| draft | preview copy |

## Length budgets
| Kind | Budget |
|---|---|
| Button | 1 to 3 words, verb first. "Find cover…", "Leave as is", "Add time off" |
| Heading, tab, count label | 1 to 3 words |
| Hint under a control | one sentence, about 90 characters or fewer |
| Banner or status line | one or two sentences; the fact first |
| Message after an action | what happened, with Undo where it can be undone |
| Error | what is wrong, then how to fix it, in one or two sentences |
| Hover note | title, then up to two short lines. Rarely seen features may use up to four lines and 260 characters |

## Format
- Sentence case everywhere. Dates "Tue Oct 6". Times "9:00 AM". Counts "3 to fix", "1 day", "2 days".
- Curly apostrophes (’) and the middle dot (·) for lists of facts: "Wed Oct 21 · Rick’s".
- Periods end sentences, not labels. A hint that is one sentence ends with a period; a button never does.
- Ellipsis (…) only when the button opens another step that needs input.
- Anything that removes or replaces data says what is lost and whether Undo works.
- Hold-to-confirm buttons say "press and hold" in the accessible name, never in the visible label.

## Hover notes (one system)
- One note per spot, the nearest one. A card never lends its note to a button inside it; a part that draws its own richer note (`data-notip`) is the only note there.
- Format: `Title | line | line`. The title names the thing; the lines say why it matters or what it means, never repeat what is already visible.
- Add a hover only when it adds something: a reason, a count behind a pill, the full name behind an abbreviation, or how a rarely used feature works. Do not add one to restate a label.
- Pictures that are never labelled in words always have a note.
- On touch the same words appear on the first tap, as on the grid.
- Checked by `e2e/hover-rules.mjs`.

## Subject theme (colour and picture)
See STYLE_GUIDE.md: problems are light red, someone being off is yellow with a palm tree, covering is green with route arrows, closed and left as is are grey. The words follow the colours: anything yellow is about someone being off.

## Writing a new string: checklist
1. Is the word in the table? If the idea is new, add a row first.
2. Label or guidance? Labels are neutral; guidance is warm and leads with the fact.
3. Within its budget? If not, move the "why" into a hover.
4. Full name if there is room, otherwise first initial and last name.
5. Does the plural work for 0, 1 and many?
6. Does a hover add something, and is there only one?
7. Would the accessible name still make sense read aloud on its own?

## Error and status patterns
- Blocked: "{Name} isn’t licensed in WA. Choose someone else, or add the licence under Setup."
- Result: "{Name} is scheduled at {Store} on Tue Oct 6." + Undo
- Warning: "{Name} is now at two stores on Tue Oct 6. Choose one to keep."
- Nothing to do: "Nothing to fix." / "All covered."
