import { createFileRoute } from "@tanstack/react-router";
import { ScheduleScreen } from "@/components/schedule-screen";

export const Route = createFileRoute("/schedule")({ component: ScheduleScreen });
