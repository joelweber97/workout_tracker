# Overload

A workout tracker that logs your lifts and tells you what weight to use next.

Two implementations live here. **The web app is the one that runs on your
phone** — the iOS app can't be deployed from this machine (see below).

```
web/       the app — plain ES modules, no build step, no dependencies
android/   Capacitor shell for Google Play (wraps web/)
ios/       Capacitor shell for the App Store (wraps web/)
tools/     dev server and icon generator
WorkoutTracker/          earlier native SwiftUI prototype — superseded by the shells above
WorkoutTracker.xcodeproj
```

## The native shells

`android/` and `ios/` are [Capacitor](https://capacitorjs.com) projects that
wrap `web/` unchanged. They exist for two reasons: a store listing, and
access to HealthKit / Health Connect, which no web app can reach. The web app
stays dependency-free; `package.json` at the root is only the shell tooling.

Neither shell can be built on this Mac (no Xcode, no Android SDK), so both are
built by GitHub Actions — `android.yml` on Ubuntu, `ios.yml` on macOS 26. After
changing anything under `web/`, `npx cap sync` copies it into the shells; CI
does that itself, and the copies are gitignored.

## The web app

No dependencies, no bundler, no network. Everything — the 217-exercise library,
your sessions, the progression engine — runs on-device and works offline.
Installs to the iOS home screen with its own icon.

### Run it locally

```bash
node tools/serve.js
```

Then open <http://localhost:4173>. Any static server works; the app has no
build step.

### Put it on your phone

Push to GitHub and enable Pages (Settings → Pages → Source: GitHub Actions).
The included workflow publishes `web/` on every push to `main`. Then, on the
iPhone: open the Pages URL in Safari → Share → **Add to Home Screen**.

It must be served over HTTPS (or localhost) for the service worker and offline
support to work — GitHub Pages is HTTPS by default.

### What's in it

| Screen | What it does |
|---|---|
| **Today** | Week-to-date sessions, volume and streak; start an empty session or one from a routine; resume one in progress |
| **Active workout** | Weight, reps and RPE per set, warm-up ramps, plate maths, last session's numbers inline, a suggested working weight, personal-record alerts, supersets, automatic rest timer |
| **History** | Every finished session by month, down to individual sets |
| **Exercises** | The library grouped by muscle, with per-exercise records and an estimated-1RM trend |
| **Stats** | Weekly volume, split by body region, most-trained movements over 8 / 12 / 26 weeks, and body composition over time |
| **Coach** | Weekly hard sets per muscle against the 10–20 range, progression suggestions, programme-level observations, and a briefing to paste into Claude |

## How the coaching works

Two layers, deliberately separated.

**The progression engine (`web/js/coach.js`)** decides weights and reps. It's
deterministic, not a model call: it sees your full history exactly, the
arithmetic is reliable, and every suggestion states its reasoning, so you can
disagree with it on the evidence. It runs offline with no account and no key.

It uses double progression within a rep range derived from how you actually
train each lift, with increments matched to the equipment (a barbell moves in
plate pairs; a cable stack doesn't). On top of that:

- **Stall detection** — no improvement in estimated 1RM across three sessions
  triggers a 10% deload rather than another failed attempt.
- **RPE awareness** — if you log it. An average at or above 9.5 holds the
  weight; 7 or below earns a double jump.
- **Estimated 1RM** uses Epley (`weight × (1 + reps/30)`), with a single rep
  taken at face value.

Around it sit the things you actually need on the gym floor: **plate maths**
(what goes on each side, and how far short you are when the plates can't make
the number), a **warm-up ramp** at roughly 40/60/80% of your working weight,
**personal-record detection** the moment you tick the set, and **weekly hard
sets per muscle** against the 10–20 range — with an exercise's secondary
muscles counted as half a set, since a row trains the biceps but not the way a
curl does.

**The Claude layer (`web/js/ai.js`)** handles the qualitative half — programme
critique, what to change and why. It builds a compact briefing of your last six
weeks (sessions, weekly sets per muscle group, 1RM trends, what the local engine
already flagged) and copies it for you to paste into Claude.

It deliberately does **not** call the API from the browser. This app is static
files on a public host: any key it held would sit in `localStorage` on a page
whose source anyone can read. A key belongs behind a server, and this app
doesn't have one — so it doesn't have a key to leak. `buildBriefing` produces
exactly the payload a server-side proxy would POST, so adding one later is a
transport change rather than a rewrite.

## Your data

Sessions live in IndexedDB on your device. Nothing is uploaded, and there is no
account.

Safari evicts storage for sites it considers inactive, so **Settings → Your
data** shows whether storage is durable and lets you request persistence
(adding to the home screen usually grants it). Export a JSON backup from the
same screen now and then.

## The iOS app

`WorkoutTracker/` is a native SwiftUI + SwiftData implementation of the same
app. It is **written but never compiled** — this machine is a 2017 MacBook Pro
capped at macOS 13 Ventura, so the newest usable Xcode is 15.2, which cannot
deploy to an iPhone on iOS 26. The project file also targets the Xcode 16
format. It's kept for the day there's a newer Mac; the web app is what actually
runs on the phone today.

## Regenerating the icons

```bash
node tools/make-icons.js
```

Writes `web/icons/icon-{180,192,512}.png`. There's no image library on this
machine, so the script encodes the PNGs itself — see the comments in
`tools/make-icons.js`.
