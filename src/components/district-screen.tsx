import { Link, useNavigate } from "@tanstack/react-router";
import { DistrictMore } from "@/components/district-more";
import { EmptyArt } from "@/components/graphics";
import { MarkLegend, MonthGrid } from "@/components/month-grid";
import { StatusStrip } from "@/components/status-strip";
import { Button } from "@/components/ui/button";
import { useScheduleStore } from "@/store/schedule-store";
import { useViewStore } from "@/store/view-store";

/** The home screen: a status strip and the month. Nothing is written until a mark is pointed at. */
export function DistrictScreen() {
  const doc = useScheduleStore((s) => s.doc);
  const goTo = useViewStore((s) => s.goTo);
  const navigate = useNavigate();

  if (doc.people.length === 0) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
        <EmptyArt kind="people" className="mx-0 mb-3" />
        <div className="flex flex-wrap gap-2">
          <Button asChild>
            <Link to="/people">Add pharmacists</Link>
          </Button>
          <Button asChild variant="secondary">
            <Link to="/schedule" resetScroll={false}>
              Schedule
            </Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-[1500px] flex-col gap-4 px-4 py-4 sm:px-6 lg:py-6">
      <h1 className="sr-only">District</h1>
      <StatusStrip />
      <section aria-label="Month" className="surface flex flex-col gap-3 p-3 sm:p-4">
        <MonthGrid
          onOpen={(store, day) => {
            goTo({ store, slot: "pharmacist", day }, false);
            void navigate({ to: "/schedule", resetScroll: false });
          }}
        />
        <MarkLegend />
      </section>
      <DistrictMore />
    </div>
  );
}
