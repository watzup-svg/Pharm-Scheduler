// The little picture-and-word pills under a candidate's name: the Schedule's own icons and colours (rose = a store left short, amber = a long drive, palm = time off).
import { cx } from "../../ui/primitives.tsx";
import { BlockMark } from "../../ui/icons.tsx";
import type { Tag } from "./lib.ts";

export function Tags({ tags }: { tags: Tag[] }) {
  return (
    <ul className="mt-1 flex flex-wrap gap-1" aria-label="What to know">
      {tags.map((t) => (
        <li key={t.label + t.mark} data-tag={t.mark} title={t.title} className={cx("inline-flex items-center gap-1 rounded-full py-0.5 pl-0.5 pr-2 text-xs font-medium ring-1 ring-inset", t.tone === "bad" ? "bg-[#f0c4ba] ring-[#d98b7b]" : t.tone === "warn" ? "bg-[#f2da8f] ring-[#d3b341]" : "bg-ok-lite/70 ring-ok/30")}>
          <BlockMark kind={t.mark} tone={t.tone === "ok" ? "quiet" : t.tone} size={20} />
          {t.label}
        </li>
      ))}
    </ul>
  );
}
