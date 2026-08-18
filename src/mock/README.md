# Mock data layer

The app currently runs with **no backend**. All data comes from this folder.

- `seed.ts` — the demo dataset (Alex & Priya, 9 days of history, avoided expenses,
  weekly reviews, reminders, accounts). Pure data + types.
- `api.ts` — an async, promise-based API that mimics a backend (auth, challenge
  data, habits, expenses, reviews, reminders, admin). State is kept in memory and
  mirrored into `localStorage` so refreshes keep session changes.

## Demo account

`demo@100days.app` / `demo1234` (admin). Any account you create through sign-up
works too, and the onboarding screen lets you claim the Alex or Priya profile.

## Wiring a real backend later

UI components never import `seed.ts`. They go through:

- `src/hooks/useChallenge.ts` (queries/mutations)
- `src/mock/api.ts` (the API surface)

Replace the bodies of the functions in `api.ts` with real network calls and keep
their signatures — nothing else needs to change.
