// Time off: waiting requests, upcoming, and adding someone. (The old build's page; the right-column form is the quick path.)
import { SomeonesOut } from "./SomeonesOut.tsx";

export function TimeOff() {
  return (
    <div className="mx-auto max-w-[720px] p-3">
      <h2 className="sr-only">Time off</h2>
      <SomeonesOut />
    </div>
  );
}
