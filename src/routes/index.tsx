import { createFileRoute } from "@tanstack/react-router";
import { DistrictScreen } from "@/components/district-screen";

export const Route = createFileRoute("/")({ component: DistrictScreen });
