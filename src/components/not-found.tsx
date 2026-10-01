import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";

export function NotFound() {
  return (
    <div className="mx-auto max-w-md px-4 py-16 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">That page isn’t here</h1>
      <p className="mt-2 text-pretty text-muted">The link may be old. Your schedule is safe; start again from the district page.</p>
      <Button asChild className="mt-5">
        <Link to="/">Go to the district page</Link>
      </Button>
    </div>
  );
}
