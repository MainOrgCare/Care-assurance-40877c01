# Rostering — How It Works

> A plain-English explainer for care managers, registered managers, and IT/data-governance reviewers.
> _Audience: non-engineers who need to understand exactly what the Rostering module does, what it looks at, and what it does **not** do with your data._

---

## 1. What the Rostering module is for

The Rostering module is a **decision-support workbench** for care coordinators. You give it your existing weekly visit schedule (typically exported from your rostering system as an Excel workbook) and it shows you, side-by-side with the original, an **optimised version** of the same week — with concrete, line-by-line suggestions for changes that would reduce travel time, balance care-worker workloads, and protect continuity of care.

It is a workbench, not an autopilot. **Nothing changes in your live rostering system unless a human reviewer explicitly accepts a recommendation.** The module produces suggestions; people make the calls.

---

## 2. The single most important thing to know — there is no AI in the optimiser

This is not an AI tool. The scheduling logic is **fully deterministic and rules-based**.

Concretely, this means:

- The optimisation engine is a piece of plain code that follows the same well-defined steps every time. Given the same inputs and the same settings, it will always produce **exactly the same output**.
- **No large language model, no neural network, no machine-learning model, and no third-party AI service is involved** in producing the recommendations.
- Every recommendation is **explainable**. Each suggested change carries a machine-readable reason ("reduces travel gap by 14 minutes", "preserves regular worker for this service user", "moves call back inside the Morning tolerance window") that a manager can audit and challenge.
- There is **no model that learns from your data** over time. There is no training, no fine-tuning, no embedding store, and no behavioural profile being built up about either care workers or service users.

If your organisation's policy is "no AI in clinical or workforce decisions" — the Rostering module is compliant with that policy out of the box, with no toggles to remember to switch off.

---

## 3. The second most important thing — your data never leaves your installation

The Rostering module is **self-contained inside your Care Assurance deployment**. When you upload a weekly schedule:

- The file is **parsed in memory** the moment it arrives at the server. It is never written to disk, never uploaded to cloud storage, never sent to an external API, and never forwarded to any third party.
- A short content fingerprint (a one-way hash) is stored so the same workbook isn't ingested twice by mistake — but the original Excel file itself is **not retained anywhere**.
- The **structured rows** extracted from the workbook (the individual visits — service user, worker, planned start, planned duration, etc.) are stored in your own PostgreSQL database, on the same infrastructure as the rest of Care Assurance. They are subject to the same access controls, the same retention rules, and the same backups as every other table in the system.
- There is **no S3 bucket, no Azure Blob container, no Google Cloud Storage, no Mapbox round-trip, no Google Maps round-trip, no SaaS analytics provider, no telemetry endpoint** involved in normal rostering operations.
- The optimisation itself runs entirely **inside your Care Assurance server process**. The only network traffic involved is between the browser of the coordinator who is logged in, and your own server.
- The Rostering module does **not** call OpenAI, GitHub Models, a local LLM, or any other AI provider.

In short: a manager can review the entire week's recommendations, accept some, reject others, export the result to Excel, and at no point has any data crossed the boundary of your own deployment.

---

## 4. What the module looks at — the inputs

The optimiser draws only on data that already lives inside Care Assurance. The main inputs are:

| Source | What it contributes |
| --- | --- |
| **The uploaded weekly workbook** | The list of planned visits for the week: which service user, which worker is currently assigned, planned start time, planned duration, call type (Morning / Lunch / Tea / Bed), whether it is templated, whether it is marked time-critical, and whether it is a double-up. |
| **Service-user records** | Address (used for travel-distance estimation), preferred call windows, and any flags that say "this visit must happen in this part of the day". |
| **Care-worker records** | The worker's regular weekly shift pattern (start time, end time, working days), maximum calls per day, maximum minutes per day, maximum calls per week, maximum minutes per week. |
| **Continuity templates** | A table that records "this worker normally visits this service user", with a primary-worker flag and a priority score. This is what protects continuity of care during reassignment. |
| **Recommended call-time windows** | A table of preferred time-of-day windows per service user and call type, with a tolerance in minutes (for example, "Mrs A's Morning call should be between 07:30 and 08:30, ±15 minutes"). |
| **Operator settings on the screen** | Three sliders for the relative weight of travel, workload balance, and continuity (each 0 to 1), plus a small number of toggles (lock templated calls, respect time-critical windows, enforce per-worker hour caps). |

That is the complete input list. The optimiser does **not** read free-text care notes, medication records, EMAR data, incident reports, or anything else outside the columns listed above.

---

## 5. What the module looks **for** — the rules

The optimiser checks each schedule against a fixed catalogue of conditions. Each condition is a piece of code that either flags an issue, contributes a number to one of the headline metrics, or proposes a concrete change.

### 5.1 Travel between visits

- The straight-line distance between consecutive visits on a worker's day is calculated using the **Haversine formula** (the standard great-circle distance between two latitude/longitude points).
- That distance is converted to an estimated travel time using a conservative driving rate.
- Travel gaps are categorised as **short (< 5 min), medium (5–10 min), long (10–20 min), and very long (> 30 min)**.
- A visit pair is flagged as a **"travel gap violation"** when the actual gap between the previous visit ending and the next one starting is shorter than the estimated travel time — i.e. there is no realistic way the worker could physically get there in time.
- For each worker's day, the optimiser may reorder the **non-time-critical** visits using a nearest-neighbour ordering, which is a well-known heuristic for reducing total travel.

### 5.2 Continuity of care

- The system reads the continuity templates (`worker → service user` with a primary flag) and computes a **continuity score**: out of all the templated relationships, how many are preserved by the proposed schedule.
- A higher score is better. The default behaviour is to **prefer the existing regular worker** wherever the rest of the constraints allow it.
- If the "lock templated calls" toggle is on, primary-worker assignments are treated as immovable.

### 5.3 Workload balance

- For each worker, the optimiser totals up the **minutes assigned** across the week and across each day.
- It computes the standard deviation of those totals across the team — the lower the deviation, the more evenly the work is shared.
- Workers whose load is **above their configured maximum** are flagged as "over limit".
- Workers whose load is **significantly below the team average** are flagged as "under-utilised".
- Non-templated calls may be moved from heavily-loaded workers to lightly-loaded ones to bring the variance down.

### 5.4 Per-worker hard limits

- The constraints table specifies, per worker: max calls per day, max minutes per day, max calls per week, max minutes per week.
- Any proposed reassignment that would push a worker past one of those limits is rejected by the constraint stage.

### 5.5 Time-of-day windows

- Four standard time-of-day windows are defined: **Morning (06:00–12:00), Lunch (12:00–14:00), Tea/PM (14:00–17:00), Bed/Evening (17:00–22:00)**.
- A visit labelled as belonging to one of these windows is held inside that window.
- If a service user has a more specific recommended window (e.g. "Mrs A: Morning 07:30 ± 15 min") that more specific window takes precedence.
- A visit marked **time-critical** is held within its tolerance (default ±15 minutes). The "respect time-critical" toggle controls whether this is treated as a hard rule.

### 5.6 No-overlap / no-double-booking

- A worker cannot be assigned two visits whose time ranges overlap.
- When sequencing a worker's day, if the previous visit's expected end time pushes past the next visit's planned start, the conflict is recorded so the coordinator can see it explicitly. Visits are never silently allowed to overlap.

### 5.7 Working-hours envelope

- Each worker has a working-day envelope (by default 06:00–22:00, configurable per worker).
- Visits cannot be moved outside that envelope by the optimiser.

### 5.8 Recommended call-time priority

- Before any other optimisation step runs, the engine applies any explicit recommended call-time entries. These are treated as the **highest-priority** constraint, on the principle that documented service-user preferences come first.

---

## 6. How the optimisation runs — step by step

When a coordinator clicks **Optimise**, the engine runs a small, fixed sequence of stages. Each stage takes the output of the previous one as its input.

1. **Apply documented preferences.** Any recommended call-time entry is honoured. Time-critical visits are pinned inside their tolerance window.
2. **Travel pass.** For each worker's day, non-time-critical visits are reordered using nearest-neighbour ordering to reduce total travel time.
3. **Workload pass.** Worker totals are recomputed. If the workload-balance slider is non-zero, non-templated visits are moved from over-loaded workers towards under-loaded workers, one at a time, until the variance stops improving.
4. **Continuity pass.** Reassignments made by the previous step are reviewed against the continuity templates. Where a reassignment would break a primary-worker relationship that could equally be preserved, it is reversed.
5. **Constraint check.** The resulting schedule is checked against every per-worker hard limit, every time-window rule, and the no-overlap rule. Anything that fails is recorded as a constraint violation and reported back to the screen.
6. **Metrics.** The headline numbers are computed: total travel reduction (minutes saved versus the original), workload variance (lower = more even), continuity score (percentage of templated relationships preserved), constraint-violation count, and recommended-time score (percentage of visits inside their preferred window).

There is no backtracking and no random search. Given the same workbook and the same slider settings, the engine produces the same output every time — which is exactly what you need for an auditable, defensible decision trail.

---

## 7. What you see at the end

The optimiser produces three things, all of which live in the coordinator's browser session until explicitly persisted:

1. **A Gantt-style timeline.** One row per care worker, with each visit drawn as a block on a timeline. The original schedule and the proposed schedule can be inspected side-by-side. Suggested moves are highlighted; constraint violations are outlined in red.
2. **A line-by-line list of recommendations.** Each row says: this visit, currently at this time with this worker, would be improved by moving to this time / this worker, for this concrete reason, with this confidence and priority.
3. **A metrics summary.** Travel saved, workload variance, continuity score, constraint violations, percentage of visits in their preferred window.

Everything is read-only until a human acts.

---

## 8. What a human does with it

For each recommendation, the coordinator can:

- **Accept it** — the recommendation is marked applied in the Care Assurance database (with the user, the timestamp, and the original and proposed values all recorded for audit), and a `rostering_recommendation` entry with `decision: "implemented"` is written to the system audit trail.
- **Reject it** — the recommendation is removed from the working set, and a `rostering_recommendation` entry with `decision: "rejected"` is written to the audit trail with the reason if one was given.
- **Defer it** — leave it untouched. It will be there again the next time the workbook is opened.
- **Adjust manually** — drag a visit to a different time or a different worker directly in the Gantt. Manual adjustments are held in the browser session and never written back without an explicit save action.

Nothing leaves Care Assurance automatically. To push approved changes into your live rostering system (for example Access Care Planning), a coordinator either exports the optimised schedule as a CSV/Excel file, or uses the Care Assurance browser extension to **manually assist** the data entry — the extension types the values into the live form on the coordinator's behalf, one field at a time, with the coordinator watching and able to stop at any point.

---

## 9. Audit, retention, and access

- Every accept / reject / defer action is written to the Care Assurance system audit trail with the user, timestamp, recommendation ID, original value, and proposed value.
- Every workbook ingest is logged with the user, the file fingerprint, the row count extracted, and the processing status.
- All rostering tables are subject to the same database retention and backup policy as the rest of the Care Assurance database. There is no separate rostering data store.
- Access to the Rostering module requires an authenticated session with administrator or coordinator role; the screen is not accessible to standard users.

---

## 10. What the module does **not** do

To remove any ambiguity, the following are explicit non-features of the Rostering module:

- ❌ It does **not** call an AI service.
- ❌ It does **not** train a model on your data.
- ❌ It does **not** upload your file or your data to any external system.
- ❌ It does **not** retain the uploaded workbook on disk.
- ❌ It does **not** auto-apply recommendations.
- ❌ It does **not** write back to your live rostering system without a human action.
- ❌ It does **not** make medication, clinical, or safeguarding decisions.
- ❌ It does **not** build a behavioural profile of either care workers or service users.
- ❌ It does **not** rank, score, or assess care workers as people. Workload and utilisation figures are about the _schedule_, not about the worker.

---

## 11. One-paragraph summary

The Rostering module is a **deterministic, rules-based workbench** that reads your weekly visit schedule and your existing care-worker and service-user records, applies a fixed and explainable set of checks (travel feasibility, continuity, workload balance, per-worker hour caps, time-of-day windows, no-overlap), and produces a side-by-side proposed schedule with concrete, individually-acceptable recommendations. **No AI is involved at any stage.** **No data leaves your Care Assurance deployment at any stage.** A human coordinator reviews every recommendation, and only the recommendations a human accepts are recorded; only the changes a human chooses to export are sent anywhere else.
