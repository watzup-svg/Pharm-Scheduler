import { Link, useRouterState } from "@tanstack/react-router";
import { cn } from "@/lib/utils";

const SETUP = [
  { to: "/people", label: "People" },
  { to: "/stores", label: "Stores" },
  { to: "/holidays", label: "Holidays" },
] as const;

/**
 * Wraps Time off and the setup pages. People, Stores and Holidays share the Setup tab; `setup` adds the switcher between them.
 * The header nav and phone tab bar already lead back to Schedule.
 */
export function ListsScreen({ children, setup = false }: { children: React.ReactNode; setup?: boolean }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return (
    <div>
      {setup ? (
        <nav aria-label="Setup" className="mx-auto flex w-full max-w-[1500px] gap-1 px-4 pt-4 sm:px-6">
          <div className="inline-flex gap-1 rounded-xl bg-white p-1 ring-1 ring-line">
            {SETUP.map((item) => {
              const active = pathname === item.to || (item.to === "/people" && pathname === "/lists");
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  aria-current={active ? "page" : undefined}
                  className={cn("inline-flex h-11 items-center rounded-lg px-4 text-sm font-semibold", active ? "bg-ink text-cream" : "text-ink hover:bg-paper")}
                >
                  {item.label}
                </Link>
              );
            })}
          </div>
        </nav>
      ) : null}
      {children}
    </div>
  );
}
