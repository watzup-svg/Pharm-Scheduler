import { createFileRoute } from "@tanstack/react-router";
import { StyleGuide } from "@/components/style-guide";

export const Route = createFileRoute("/style")({ component: StyleGuide });
