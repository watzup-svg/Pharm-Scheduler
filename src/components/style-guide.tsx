import { BrandBadge, BrandMark } from "@/components/brand-mark";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Label } from "@/components/ui/label";
import { TONE_CLASS, TONE_TAG, type Tone } from "@/components/day-view";
import { cn } from "@/lib/utils";

const COLORS: { name: string; hex: string; use: string; cls: string }[] = [
  { name: "Brand red", hex: "#C8102E", use: "The logo and today’s date only. Buttons and selections are ink; red is kept for problems", cls: "bg-brand" },
  { name: "Wordmark red", hex: "#E82020", use: "The logo artwork only. Never in the interface", cls: "bg-wordmark" },
  { name: "Night", hex: "#201820", use: "Logo outline, header blocks, tags", cls: "bg-night" },
  { name: "Background", hex: "#F7F4EF", use: "Page", cls: "bg-paper ring-1 ring-line" },
  { name: "Card", hex: "#FFFFFF", use: "Panels and cards", cls: "bg-cream ring-1 ring-line" },
  { name: "Hairline", hex: "#D9D3C7", use: "Borders and dividers", cls: "bg-line" },
  { name: "Text", hex: "#1C1C1C", use: "Primary text, buttons and selections", cls: "bg-ink" },
  { name: "Secondary text", hex: "#5C5854", use: "Hours, notes, hints", cls: "bg-muted" },
  { name: "Error / closed", hex: "#8C3A2F", use: "Problems and closed days. Never brand red", cls: "bg-illegal" },
  { name: "Available / open", hex: "#2F6F4E", use: "Status only: staffed, open, covered", cls: "bg-ok" },
  { name: "Time off", hex: "#F2D56A", use: "Yellow: time off, still prints", cls: "bg-warn-bg" },
];

const TYPE = [
  { cls: "text-3xl font-semibold", label: "Title 30 / semibold", sample: "13 to fix" },
  { cls: "text-5xl font-semibold tabular-nums", label: "Count 48 / semibold, the numeral in the status strip", sample: "13" },
  { cls: "text-base font-semibold", label: "Store name, date, section 16 / semibold", sample: "Estacada · Friday, Oct 9" },
  { cls: "text-sm font-semibold", label: "Button label 15 / semibold", sample: "Approve" },
  { cls: "text-sm", label: "Body 15 / regular", sample: "Mon–Fri 9:00 AM–6:00 PM; Sat 9:00 AM–2:00 PM" },
  { cls: "text-xs text-muted", label: "Notes 13 / regular", sample: "Time off still prints. Only these block the print pack." },
];

const TONES: { tone: Tone; word: string }[] = [
  { tone: "ok", word: "Staffed" },
  { tone: "cover", word: "Cover" },
  { tone: "off", word: "Time off" },
  { tone: "hole", word: "No coverage" },
  { tone: "double", word: "Two places" },
  { tone: "license", word: "Not licensed" },
  { tone: "leftover", word: "Name on a closed day" },
  { tone: "closed", word: "Closed" },
];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="surface p-4 sm:p-5">
      <h2 className="mb-3 text-base font-semibold">{title}</h2>
      {children}
    </section>
  );
}

/** Live examples of the style, drawn with the same components the app uses. */
export function StyleGuide() {
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-4 px-4 py-6 sm:px-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Style guide</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          Hi-School Pharmacy scheduler. Clear before clever: one red action, quiet neutrals, plain words. Your Locally Owned Drug &amp; Variety Store.
        </p>
      </div>

      <Section title="Logo and app icon">
        <div className="flex flex-wrap items-center gap-6">
          <div className="rounded-lg bg-paper p-6 ring-1 ring-line">
            <BrandMark className="h-14" />
          </div>
          <BrandBadge className="h-16" />
        </div>
        <ul className="mt-3 list-disc pl-5 text-sm text-pretty text-muted">
          <li>The badge is artwork: never re-typed, recolored or stretched. Keep clear space of at least half the badge height on every side.</li>
          <li>Use the red-and-black badge on white. The gray-outline version and the square avatar are kept for other uses.</li>
          <li>Official files live in <code>src/assets/brand</code>. A small hex icon (if supplied later) replaces the badge in the header automatically.</li>
        </ul>
      </Section>

      <Section title="Color">
        <ul className="grid gap-2 sm:grid-cols-2">
          {COLORS.map((c) => (
            <li key={c.hex + c.name} className="flex items-center gap-3">
              <span aria-hidden className={cn("size-11 shrink-0 rounded-lg", c.cls)} />
              <span className="min-w-0 text-sm">
                <span className="font-semibold">{c.name}</span> <span className="font-mono text-xs text-muted">{c.hex}</span>
                <span className="block text-xs text-muted">{c.use}</span>
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-muted">
          Colour never carries a state alone: open days are dashed, doubles are ringed, license problems dotted, closed days hatched, and every state has a word.
        </p>
      </Section>

      <Section title="Type · Source Sans 3">
        <ul className="flex flex-col gap-2">
          {TYPE.map((t) => (
            <li key={t.label} className="flex flex-wrap items-baseline justify-between gap-x-4 border-b border-line pb-2 last:border-0">
              <span className={t.cls}>{t.sample}</span>
              <span className="text-xs text-muted">{t.label}</span>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Buttons · radius 10, one filled red per screen">
        <div className="flex flex-wrap gap-2">
          <Button>Print pack</Button>
          <Button variant="secondary">Approve</Button>
          <Button variant="ghost">Cancel</Button>
          <Button disabled>Disabled</Button>
        </div>
        <p className="mt-2 text-xs text-muted">Every target is at least 44 px. Secondary actions are ink with a hairline; they never compete with the red one.</p>
      </Section>

      <Section title="Form fields">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor="sg-name">Name</Label>
            <Input id="sg-name" placeholder="Jane Smith" />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="sg-home">Home store</Label>
            <NativeSelect id="sg-home" defaultValue="EST">
              <option value="EST">EST · Estacada</option>
              <option value="MOL">MOL · Molalla</option>
            </NativeSelect>
          </div>
        </div>
      </Section>

      <Section title="Calendar day states">
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {TONES.map(({ tone, word }) => (
            <li key={tone} className={cn("flex min-h-14 flex-col rounded-lg px-2 py-1 text-xs", TONE_CLASS[tone])}>
              <span className="font-semibold">{word}</span>
              {TONE_TAG[tone] ? <span className="mt-auto w-fit rounded-sm bg-white/70 px-1 text-xs font-bold uppercase">{TONE_TAG[tone]}</span> : null}
            </li>
          ))}
          <li className="flex min-h-14 flex-col rounded-lg bg-white px-2 py-1 text-xs shadow-[0_0_0_2px_var(--color-brand)]">
            <span className="font-semibold">Today</span>
            <span className="mt-auto w-fit rounded-sm bg-brand px-1 text-xs font-bold text-brand-fg">14</span>
          </li>
        </ul>
      </Section>

      <Section title="Status chips">
        <div className="flex flex-wrap gap-2 text-sm font-semibold">
          <span className="rounded-full bg-ok-bg px-3 py-1 text-ok">Ready to print</span>
          <span className="rounded-full bg-ok-bg px-3 py-1 text-ok">Open</span>
          <span className="rounded-full bg-illegal-bg px-3 py-1 text-illegal">3 to fix</span>
          <span className="rounded-full bg-shut px-3 py-1 text-muted">Closed</span>
          <span className="rounded-full bg-warn-bg px-3 py-1 text-warn">Time off</span>
          <span className="rounded-full bg-night px-3 py-1 text-white">from EST</span>
        </div>
      </Section>

      <Section title="Patterns">
        <ul className="list-disc pl-5 text-sm text-pretty text-muted">
          <li>Editing a day opens a panel on the right on a laptop (the calendars stay in view) and a bottom sheet on a phone.</li>
          <li>Add and edit forms for people, stores and holidays open in a drawer. Lists become cards on a phone.</li>
          <li>Toasts are white with a thin colored edge: green for done, brick for a problem, amber for a caution. Undo is always on the right.</li>
          <li>Motion is a short fade or rise, and is switched off when the device asks for less motion.</li>
          <li>File menu, Display: Larger text and High contrast. Text is never set smaller than 12 px.</li>
        </ul>
      </Section>

      <Section title="Sample screens">
        <p className="text-sm text-muted">The week schedule, shift detail and store picker are the live Schedule page (Week view), the day sheet (tap any day), and the store chips above the calendars. The District page is the landing screen.</p>
      </Section>
    </div>
  );
}
