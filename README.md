# Ledger

A workout tracker for iPhone. Log sets as you lift, keep a library of movements
and reusable routines, and watch volume and estimated 1RM move over time.

Native SwiftUI, SwiftData for persistence, Swift Charts for the graphs. No
account, no network, no third-party dependencies — everything lives on device.

## Requirements

- Xcode 16 or later
- iOS 17.0+ (SwiftData and the Observation macros are the floor)

## Running it

```bash
open WorkoutTracker.xcodeproj
```

Pick an iPhone simulator and press ⌘R. On first launch the app seeds a starter
library of ~29 exercises and three routines (Push / Pull / Legs); the seed runs
once per install and never overwrites anything you've added.

## What's in it

| Screen | What it does |
|---|---|
| **Today** | Week-to-date sessions, volume, and streak; start an empty workout or one from a routine; resume a session already in progress |
| **Active workout** | Per-set weight and reps, warm-up flag, previous-session numbers inline, automatic rest timer, live volume and elapsed time |
| **History** | Finished sessions by month, drilling into every set |
| **Exercises** | The movement library, grouped by muscle, with per-exercise PRs and an estimated-1RM trend |
| **Stats** | Weekly volume, split by body region, and most-trained movements over 8 / 12 / 26 weeks |

## How it's laid out

```
WorkoutTracker/
├── Models/       SwiftData models — Exercise, Workout, WorkoutEntry, SetEntry, Routine
├── Views/        One file per screen
├── Components/   Shared UI — stat tiles, set row, rest timer bar, exercise rows
└── Support/      Formatters, settings, stats math, seed data, workout creation
```

A few decisions worth knowing about:

- **Weights are stored in kilograms.** The UI converts on the way in and out, so
  switching between lb and kg never changes what you logged.
- **`Exercise` is the definition; `WorkoutEntry` is one appearance of it.** That
  split is what makes per-exercise history and PRs possible.
- **Deleting an exercise archives it** rather than removing the row, so old
  sessions don't turn into "Deleted exercise".
- **Finishing a workout drops sets you never checked off**, and discards the
  session entirely if nothing was logged.
- **Estimated 1RM uses the Epley formula** (`weight × (1 + reps/30)`), with a
  single rep taken at face value.
- **The rest timer is wall-clock based**, so backgrounding the app mid-rest
  doesn't stretch the countdown.

## Status

Version 0.1.0. Written but not yet compiled — see the note in the commit history.
