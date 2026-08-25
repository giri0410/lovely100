/**
 * Every string whose wording depends on whether a journey is solo or shared.
 *
 * There are already several duplicated label lists in this codebase; this exists
 * so pronouns don't become another one. If a screen needs to say "you" or "we",
 * it asks here rather than branching inline.
 *
 * `memberCount` matters separately from `kind`: a shared journey whose partner
 * hasn't accepted their invite yet has one member, and should not claim a "team
 * score" of one person.
 */

export const PRODUCT_NAME = "Lovely 100";

export type JourneyKind = "solo" | "shared";

export interface CopyContext {
  kind: JourneyKind;
  memberCount: number;
}

/** True when there is genuinely more than one person to talk about. */
function isTogether(ctx: CopyContext): boolean {
  return ctx.kind === "shared" && ctx.memberCount > 1;
}

export function copy(ctx: CopyContext) {
  const together = isTogether(ctx);

  return {
    together,

    /** Page titles and headers. */
    statsTitle: together ? "Our statistics" : "Your statistics",
    statsSubtitle: together
      ? "Progress you're building together, never a competition."
      : "Progress you're building, one day at a time.",

    summaryTitle: together ? "Our 100-Day Journey" : "Your 100-Day Journey",
    summaryDoneTitle: together ? "100 Days Completed ❤️" : "100 Days Completed 🎉",
    summaryDoneSubtitle: together
      ? "Look at everything you built together."
      : "Look at everything you built.",
    timelineTitle: together ? "Our timeline" : "Your timeline",

    /**
     * The headline score. Solo journeys get an honest label instead of a "team
     * score" that is really just one person's own completion.
     */
    scoreLabel: together ? "Together score" : "Your consistency",

    /**
     * The headline number on Today: days showed up, not an average of
     * completion percentages. "Days together" only claims togetherness when
     * there genuinely is someone else.
     */
    showUpLabel: together ? "Days you both showed up" : "Days you showed up",
    scoreRingSublabel: together ? "Together score" : "Consistency",

    /** Streak framing. */
    bestStreakLabel: together ? "Best streak together" : "Best streak",
    perfectDaysLabel: together ? "Perfect days together" : "Perfect days",
    completedDaysSuffix: together
      ? "days fully completed together so far."
      : "days fully completed so far.",

    todaySubtitle: together
      ? "Small habits. Better health. Stronger discipline. Together."
      : "Small habits, 100 days, and the story you keep.",

    /** The Today screen's comparison table only makes sense with two people. */
    todayTableTitle: together ? "Together today" : "Today at a glance",

    /** Weekly review prompts. */
    reviewImprovePrompt: together
      ? "What should we improve next week?"
      : "What should you improve next week?",
    reviewSubtitle: together
      ? "A gentle look back, and a plan for the week ahead."
      : "A gentle look back, and a plan for your week ahead.",

    /**
     * Footer under the Today table when nobody else is in the journey. A solo
     * journey is a complete thing, not a broken shared one, so this only
     * mentions inviting when the person actually chose "with someone".
     */
    soloFooter:
      ctx.kind === "shared"
        ? "Share your invite code from Settings to track this together."
        : "Just you, one day at a time. You can invite someone from Settings whenever you like.",

    /** Invite nudge, shown only when there's room for someone else. */
    inviteNudge:
      ctx.kind === "shared" && ctx.memberCount <= 1
        ? "Your invite is still open — share your code from Settings."
        : null,
  };
}

export type Copy = ReturnType<typeof copy>;
