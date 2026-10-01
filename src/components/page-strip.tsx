import { HeroCount, HeroIcon, HeroLayout, HeroLead } from "@/components/hero";
import { AlarmMark, type AlarmKind } from "@/components/marks";

/** The header of a page that is not the month. A thin wrapper so every page passes the same four slots. */
export function PageStrip({ title, lead, tiles, actions, graphic, glow }: { glow?: "away"; title: string; lead: React.ReactNode; tiles?: React.ReactNode; actions?: React.ReactNode; graphic?: React.ReactNode }) {
  return (
    <>
      <h1 className="sr-only">{title}</h1>
      <HeroLayout label={title} lead={lead} tiles={tiles} actions={actions} graphic={graphic} glow={glow} />
    </>
  );
}

export const Count = HeroCount;
export { AlarmMark, HeroIcon, HeroLead };
export type { AlarmKind };
