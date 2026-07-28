# Contributing to SC Overlay

Contributions are welcome. This is a one-person project that a lot of people
use in-game, so the bar is "does it work on someone else's machine", not
"is it clever".

## Licence of contributions

By submitting a pull request, patch or other contribution, you agree that:

1. **Your contribution is licensed to SubliminalsTV under the same terms as the
   project** — the Functional Source License 1.1 (FSL-1.1-MIT), see
   [LICENSE.md](LICENSE.md) — and you grant SubliminalsTV a perpetual,
   worldwide, irrevocable, royalty-free licence to use, modify, sublicense and
   **relicense** it as part of SC Overlay.
2. **You wrote it, or you have the right to submit it.** If it is someone
   else's work, say so and name the licence it came from.

Point 1 matters: without it, every contributor holds a veto on any future
licence change, and the project can never move again. You keep the copyright in
your own work — this is a licence to the project, not an assignment.

Contributions are recorded in the git history, which is the credit record.

## Forks and ports

You may publish a fork or a port under the licence, including a build for an
operating system this project does not support, as long as it is not a
commercial substitute for SC Overlay. If you do:

- **give it its own name** — the project's names and logos are not licensed
  (see the Trademarks clause in [LICENSE.md](LICENSE.md));
- **say clearly that it is unofficial**, so users know who to ask for support;
- ship [LICENSE.md](LICENSE.md) with it and leave the copyright notices intact.

Upstreaming is preferred where it makes sense. If your port needs changes in
the core to stay in sync — a path that is hardcoded to Windows, a shell call, a
native dependency — open an issue or a PR for that part rather than carrying a
private patch forever. Platform-portability fixes are welcome even when the
platform itself is not officially supported.

## Before you open a PR

- `npm install`, then `npm run typecheck` and `npm run build`.
- If you touched the overlay widgets, run the DOM tests. They need the sidecar
  running (`npm run overlay`) in another terminal:

```bash
npm run test:widgets
```

- Match the surrounding style. Comments in this codebase explain *why*
  something is the way it is, usually because of a bug that is not obvious from
  the code — keep that habit.
- Keep the diff to the thing you are fixing.

## Reporting a bug

Include your Linux version, the app version (bottom-right of the overlay),
what you expected, and what happened. If it involves the game, the Star Citizen
build number helps.

**Never paste a sync token** (`scbp_…`) into an issue. Rotate it in Settings if
one leaks.

## Security

For anything that could expose other users' data, email <sub@subliminal.gg>
rather than opening a public issue.
