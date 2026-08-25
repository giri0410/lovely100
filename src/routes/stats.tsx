import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * /stats used to be a second screen of numbers alongside /analytics, including
 * its own copy of the monthly-savings chart that /money already showed. Two
 * places to look for "how am I doing" is an information-architecture bug, not a
 * feature, so the numbers live in one place now.
 *
 * Kept as a redirect rather than deleted: the route was in the main navigation
 * for months, so bookmarks and any link out there should still land somewhere
 * sensible instead of on a 404.
 */
export const Route = createFileRoute("/stats")({
  beforeLoad: () => {
    throw redirect({ to: "/analytics", replace: true });
  },
});
