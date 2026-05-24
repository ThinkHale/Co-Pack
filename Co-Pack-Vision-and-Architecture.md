# Co-Pack

## Vision & Architecture Plan

---

## 1. The Pitch

**Co-Pack** is a mobile idle/simulation game where you run a contract packaging operation. You hire associates, staff lines, manage attendance and morale, fulfill client orders, and grow from a single line to a multi-site empire. Underneath the fun, the game's mechanics quietly teach a real truth: your people ARE your business.

Two builds, one codebase:

* **Co-Pack (consumer)**: free-to-play React Native game on iOS and Android. A genuinely fun idle game.
* **Co-Pack Floor (internal)**: web-based reskin used at orientations, client visits, and recognition moments. Same engine, Employbridge/ProLogistix/ResourceMFG branding, narrative reframed to show associates the impact they have.

---

## 2. Core Game Concept

### Setting

A contract packaging facility. The player is the operator. Clients drop orders that need to be packaged, palletized, and shipped. Workers staff the lines. Time progresses in shifts.

### The Core Loop

1. **Receive orders** from clients with deadlines, volumes, and quality specs
2. **Assign workers** to stations on each line
3. **Run the shift** (idle progression with event interrupts)
4. **Handle events** (no-shows, rejects, rush orders, equipment issues)
5. **Fulfill orders** to earn revenue and client reputation
6. **Reinvest** in workers, equipment, automation, training
7. **Scale** to new lines, clients, and eventually new facilities

### What Makes It Different

Most idle games treat workers as faceless multipliers. Co-Pack treats workers as the actual point.

Every associate has:

* A **name** and a **face** (generated, but persistent)
* A **tenure** (days with the company)
* A **reliability** score (attendance pattern)
* A **morale** score (affects speed, quality, retention)
* A **skill profile** (stations they're trained on)
* A **relationship graph** (referrals, friends on the line)

When a 90-day associate quits, you feel it. When you promote someone to lead, the line gets faster AND morale goes up. When you cut a corner on safety to push an order out, reliability drops across the board.

This isn't a moral lesson, it's a mechanic. The game just works that way.

---

## 3. Progression Design

### Early Game (Days 1 to 7 of play)

* One line, six stations
* Three to five workers
* One client, one SKU
* Manual everything. Player taps to assign, react to events, manage tempo
* Goal: survive the first big order. Learn the rhythm

### Mid Game (Days 7 to 30)

* Two to three lines, multiple SKUs
* Twelve to twenty workers
* Three to five clients with different demands
* Unlock supervisors who auto-handle routine assignments
* Unlock the HR panel: referral bonuses, attendance programs, training tracks
* Unlock equipment upgrades (faster conveyors, auto-labelers, etc.)
* Goal: stabilize. Build a workforce that runs itself

### Late Game (Day 30 plus)

* Multi-site operation
* VIP client contracts with strict SLAs and big payouts
* Labor market events (tight market, wage pressure, competitor poaching)
* Prestige system: sell a facility, start fresh elsewhere with permanent perks
* Goal: optimize and master. Leaderboards, weekly client tournaments

---

## 4. The Hidden Curriculum (Workforce Truths the Game Teaches)

Built into the math, never into the dialogue:

| Real-world truth | How Co-Pack encodes it |
|---|---|
| Tenure beats turnover | Tenure curve: a 90-day worker is roughly 2x as productive as a day-one, and the curve keeps climbing |
| Referrals are gold | Referred workers start with higher morale and reliability |
| Attendance is a system, not a personality flaw | Reliability responds to schedule predictability, commute, and respect events |
| Recognition is cheap and works | "Shout-out" action costs nothing, boosts morale measurably |
| Bad managers tank good operations | Supervisor quality affects every worker under them |
| Burnout is invisible until it isn't | Overtime accelerates output short-term, destroys morale and retention long-term |
| Safety culture isn't optional | Corner-cutting boosts speed, then triggers incident events that cost weeks of progress |

---

## 5. The Dual Build Strategy

### Co-Pack (Consumer Game) — React Native

* iOS and Android
* Free to play
* Real-time idle progression with offline catch-up
* Cloud save via Firebase
* Cosmetic IAP (facility themes, worker uniforms, equipment skins)
* Optional "Consultant" subscription tier for advanced analytics
* Optional accelerators, never required to progress
* No pay-to-win

### Co-Pack Floor (Internal Tool) — Web

* Browser-based, same engine, different shell
* Branded for Employbridge / ProLogistix / ResourceMFG
* Designed to run on a TV, laptop, or tablet at orientations and client sites
* Scenario mode: pre-loaded situations like "Your line at 100% staffing" vs "Your line with 3 call-outs at 6am"
* Recognition mode: input a real associate's name and tenure, generate a personalized "impact card" showing their in-game equivalent
* Client demo mode: walk a client through what staffing decisions actually do to throughput
* No monetization. This is a sales and engagement asset

### Shared Foundation

* Game logic (the simulation engine) is platform-agnostic JavaScript/TypeScript
* React Native and React Web both consume the same engine package
* State persistence differs: Firebase for mobile, local storage or session for web demo

---

## 6. Technical Architecture

### High-Level Structure

```
copack/
├── packages/
│   ├── engine/              # The simulation. Pure TypeScript, no UI
│   │   ├── workers/         # Worker generation, morale, attendance
│   │   ├── lines/           # Station logic, throughput
│   │   ├── clients/         # Order generation, contracts, reputation
│   │   ├── events/          # Random events, triggers, consequences
│   │   ├── economy/         # Money, wages, upgrades
│   │   └── tick.ts          # The core game loop
│   │
│   ├── shared-ui/           # Reusable React components (work in both RN and web)
│   │   ├── primitives/      # Buttons, cards, modals
│   │   └── widgets/         # Worker cards, line displays, order tickets
│   │
│   ├── mobile/              # React Native app (consumer game)
│   │   ├── screens/
│   │   ├── navigation/
│   │   └── services/        # Firebase auth, save sync, IAP
│   │
│   └── web/                 # Web app (Employbridge demo)
│       ├── pages/
│       ├── scenarios/       # Pre-loaded demo scenarios
│       └── branding/        # Logo, colors, copy overrides
│
├── assets/                  # Shared art, sound, icons
└── docs/                    # Design docs, balance spreadsheets
```

### Tech Stack

| Layer | Choice | Why |
|---|---|---|
| Monorepo | npm workspaces or pnpm | Shared engine across mobile and web |
| Engine | TypeScript, no framework | Portable, testable, deterministic |
| Mobile | React Native + Expo | One codebase, fast iteration, you know it |
| Web | React + Vite | Lightweight, fast dev loop, GitHub Pages compatible |
| State | Zustand | Lightweight, works in both RN and web, no Redux ceremony |
| Persistence (mobile) | Firebase (Auth + Firestore) | You already know it |
| Persistence (web demo) | localStorage + scenario JSON | No backend needed for demo |
| Animations | Reanimated (RN), Framer Motion (web) | Best in class for each platform |
| Audio | expo-av (RN), Howler.js (web) | Standard choices |
| Analytics | PostHog or Firebase Analytics | Track retention, monetization funnels |

### The Engine: How the Simulation Works

The engine is the heart of the project. It runs the same way on every platform.

**Tick model**: Every 1 second of real time = 1 minute of game time during active play. Offline progression catches up at a reduced rate when the player returns.

**Event-driven**: The simulation produces a stream of events the UI subscribes to. Examples:

* `WORKER_ARRIVED` (worker, station)
* `WORKER_NO_SHOW` (worker, reason)
* `ORDER_COMPLETED` (order, qualityScore, revenue)
* `MORALE_SHIFT` (worker, delta, cause)
* `INCIDENT` (severity, affectedWorkers)

The UI reacts to events. The engine doesn't know or care what's drawn.

**Deterministic with seeded randomness**: Same seed produces the same outcomes. Critical for scenario mode in the web demo. You can demo "what happens when 3 people call out at 6am" reliably every time.

**Configuration via JSON**: All workers, clients, events, and upgrades are JSON-driven. Easy to balance, easy to reskin for the Employbridge version.

---

## 7. Design Pillars

When making any decision, check it against these:

1. **People are the point.** If a feature would make workers feel disposable, redesign it.
2. **Real beats cartoon.** The aesthetic should feel like a real shop floor, not a colorful idle clicker. Inspired by your welding background and operations reality.
3. **Discoverable, not preachy.** The workforce truths are mechanics, not lectures. Players discover them by playing.
4. **Fair monetization.** No pay-to-win. Ever. Cosmetics and convenience only.
5. **Offline-respectful.** A good idle game rewards you for coming back, not for staring at it.
6. **Demo-ready.** Every build should be presentable to a client or an associate without filter.

---

## 8. Roadmap

### Phase 0: Validate the Core Loop (1 to 2 weekends)

* Build a browser prototype in React with a single line, three workers, one client
* Prove the loop is fun for 10 minutes
* Tune the morale and attendance math until events feel meaningful

### Phase 1: Engine Extraction (1 weekend)

* Pull the simulation logic out of the prototype into the `engine` package
* Wire it back up to the prototype to confirm nothing broke
* This is the foundation everything else stands on

### Phase 2: Web Demo MVP (1 to 2 weekends)

* Build the Employbridge-branded web shell
* Add scenario mode with 3 to 5 pre-loaded situations
* Make it demo-ready for an orientation or client visit
* This is your first usable deliverable and it doubles as marketing

### Phase 3: React Native MVP (3 to 5 weekends)

* Set up Expo, navigation, basic screens
* Wire the engine in
* Firebase auth and cloud save
* Submit a TestFlight build, gather feedback from a small group

### Phase 4: Content and Polish (ongoing)

* More workers, clients, events, upgrades
* Animations, audio, juice
* Tutorial flow
* Analytics, balance tuning

### Phase 5: Launch

* App Store and Play Store submission
* Soft launch in a small market, iterate
* Full launch with a content push

---

## 9. Open Questions to Resolve Before Building

* Art style: pixel art, low-poly 3D, or stylized 2D vector? (Affects scope significantly)
* Worker portraits: AI-generated, illustrated, or abstract icons?
* Sound design: ambient shop floor sounds or chiptune?
* Multiplayer: any element of social play (leaderboards, gifting, co-op contracts) or strictly solo?
* Monetization timing: launch free with cosmetics only, or include the Consultant tier from day one?

---

## 10. Why This Will Work

* **You have the rarest input**: deep operational expertise. Most game designers would have to research what you live every day
* **The dual-build strategy de-risks the consumer game**: even if the App Store launch underperforms, the internal tool is immediately valuable
* **The pitch writes itself**: "An idle game where your workforce actually matters" is a one-liner that lands
* **It aligns with your career story**: a Market Manager who builds an engagement tool that doubles as a published mobile game is a hell of a portfolio piece for the Executive Operations Manager role and beyond
* **Tech stack matches what you already know**: React, React Native, Firebase, TypeScript. No new platforms to learn

---

*Next step: confirm this vision, then start Phase 0 with a browser prototype of the core loop.*
