# Effort Log — llm-onpage-summarizer

Time analysis based on git history (commit timestamps).

> Methodology: session time = difference between first and last commit of the day.
> Sessions with a single commit are estimated at 15 min (minimum).

---

## Session log

| Date | Commits | Work description | Session time |
|------|---------|-----------------|-------------|
| 2026-03-27 | 27 | Phase 1 MVP + Phase 2 UX + Phase 3 Extras (prompt templates, model dropdown, history, Markdown, dynamic prompt tabs, Clear/Copy buttons, settings open by default, dropdown arrow) | 4 h 38 min (17:12–21:50) |
| 2026-03-28 | 5 | Phase 3.5: Max text length in UI, lock Summarize tab, remove system prompt, README "Why bother?" section, .gitignore | ~1 h |

*Table updated after each session.*

---

## Phase summary

| Phase | Commits | Time |
|-------|---------|------|
| Phase 1 — MVP | 3 | ~1 h |
| Phase 2 — UX Polish | 4 | ~1 h |
| Phase 3 — Extras | 18 | ~2.5 h |
| Phase 3.5 — Settings & Prompt | 3 | ~30 min |
| Docs / Infra | 4 | ~30 min |
| **Total** | **32** | **~5 h 30 min** |

---

## How to update

After each session run:

```bash
# View commits with timestamps
git log --pretty=format:"%h %ad %s" --date=format:"%Y-%m-%d %H:%M"

# View commits for a specific day
git log --after="2026-03-28 00:00" --before="2026-03-28 23:59" --pretty=format:"%h %ad %s" --date=format:"%H:%M"
```

Then update the tables above manually (or ask Claude).

---

## Session 1 — 2026-03-27

| Parameter | Value |
|-----------|-------|
| Date | 2026-03-27 |
| Status | ✅ Phase 1, 2, 3 complete |
| Completed | Full cycle: MVP → UX → advanced features (dynamic tabs, docs) |
| Commits | 27 |
| Time | 4 h 38 min (17:12–21:50) |

---

## Session 2 — 2026-03-28

| Parameter | Value |
|-----------|-------|
| Date | 2026-03-28 |
| Status | ✅ Phase 3.5 complete |
| Completed | Settings UX (Max chars, locked Summarize tab), system prompt removal, README motivation section, .gitignore |
| Commits | 5 |
| Time | ~1 h |
