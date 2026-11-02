# Handoff: Asana-parity work item features

All of this work is on `production` and deployed (last Asana-parity commit `53924f06d`, 2026-10-24). The `feat/asana-parity` branch was merged and deleted; new work goes on branches off `production`.

## Done (one commit per feature)

| Commit                   | Feature                                                                                                                                                                                               |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `5ada51485`              | Threaded comment replies, round "mark complete" checkbox on sub-work items, "Mark complete" in detail/peek header, inline "Add sub-work item" (type, Enter, next), no success toast per sub-item edit |
| `fcca7a834`              | Project custom properties: text, number, date, single/multi select, checkbox, URL, people. Settings → Custom properties; sidebar/peek editors; activity log                                           |
| `ea146f6b0`              | Time tracking: start/stop timer (one running per person, capped at 24h), manual entries ("1h 30m", "90m", "1:30"), time log popover                                                                   |
| `896dde9e5`, `74483f0f7` | Recurring work items: completing one creates the next, with dates shifted and sub-items copied. Triggered on save plus a 5-minute beat sweep                                                          |
| `5f14befbc`              | Work item templates (save from a work item's ⋯ menu, pick in the create form) and project templates (Settings → Templates, picked in the create-project form)                                         |
| `5b3bcea65`              | Public request forms: Settings → Forms, public page at `<space>/forms/<anchor>`. Submissions go to Intake (or straight to work items); honeypot plus 10/hour/IP limit                                 |
| `a4544f705`              | Share work items with other projects ("Also in" row) plus a "N shared work items" list in the project header                                                                                          |

Migrations: `0126`–`0131` (all new tables, no changes to existing ones). New beat task: `spawn-due-recurring-work-items`, every 5 minutes. A new Celery import was added to `CELERY_IMPORTS`.

## Verification

- Backend: full suite 1490 passed, 0 failed (Docker test stack, after the correctness pass). New tests: `test_issue_comment_replies_app`, `test_custom_property_app`, `test_time_entry_app`, `test_recurrence_app`, `tests/unit/utils/test_recurrence`, `test_template_app`, `test_intake_form_app`, `test_issue_project_link_app`.
- Frontend: `check:types` passes for web and space. Lint is clean on touched files. `packages/blocks/src/utils/duration.test.ts` (vitest) passes.
- Translations: English only since the other locales were removed. sync-check is clean.
- **Not done: nobody has clicked through the UI.** There was no browser on the build machine. Check each screen once before release.

## Since the first handoff

- `1159c1581` Running timer pill in the top bar (elapsed time, link to the work item, stop).
- `a27b2cf32` Work item templates can be edited: prefilled title and priority, plus the sub-work items list.
- `ffda8bab6` Real visitor IPs for rate limits (see item 2).
- `67b874509` Custom properties as spreadsheet columns (project-level layouts), editable in place.
- Custom property filters (single/multi select, checkbox, people, and dates on a day or in a range) in project filters, evaluated server-side via `customproperty_<id>__in|exact|range` keys. Text/URL ("contains") and number ("is" / "between", open-ended ranges allowed) filters added on top, with new `text`, `number` and `number_range` filter inputs and a `contains` operator in the rich-filter system.
- Backend correctness pass (`7f27a931c`): worker and public-form rows keep their creator (`save(created_by_id=...)`); recurrences skip archived work items and archived/deleted projects, and a rule is deactivated after 5 failed spawns in a row (Redis counter, no migration); the "next due" preview uses the same helper as the spawn; template apply drops stale select values and doesn't duplicate sub-items on a second apply; project templates no longer hard-delete states used by trashed work items and always leave a default state; custom property names match case-insensitively; hidden properties can't be written; custom property filters are scoped to the view's project/workspace and skip non-numeric rows.
- Frontend pass (`2bd48f711`): a project's custom properties load once (in-flight requests shared) instead of once per spreadsheet row; bulk custom values go 100 ids per request (URL length); the running-timer clock is a leaf component so only it re-renders each second; no duplicate running-timer or template fetches; comment replies grouped in a store `computedFn`. Fixes: values and sub-items refresh after a template is applied; "No template" restores the prefilled fields; optimistic custom value edits roll back only the edited key; shared-items lists refresh after linking; the template edit modal keeps edits across refetches; the public form shows a retryable error on 5xx/network failures; URL values link only for http(s); quick-add closes on navigation.
- Merged into `production` and deployed (`53924f06d`). Migrations `0126`–`0131` and the beat task are confirmed on the live database. The correctness and frontend passes need no migrations.

## Left to do

1. **Manual UI pass** on a staging copy: sub-item checkbox and inline add; comment replies; each custom property type; timer and time log; repeat editor; template picker in the create form and in create-project; Forms settings and the public form page; "Also in" and the shared list.
2. **Real client IPs for rate limits.** The repo now has a fix: Caddy resolves the visitor from `CF-Connecting-IP` and sends the API a single `X-Forwarded-For`, and `setup-host.sh` adds `NUM_PROXIES=1` to `api.env`. Both are root-owned installed copies, so they take effect only after `sudo bash deployments/native/setup-host.sh` is re-run on the server. (Or by hand: copy the Caddyfile to `/etc/caddy/Caddyfile`, run `systemctl reload caddy`, add `NUM_PROXIES=1` to `/opt/plane/shared/api.env`, then restart `plane.target`.) Caveat: port 80 is open directly, so a client that bypasses Cloudflare can still forge `CF-Connecting-IP`.
3. Not built yet (deliberately scoped out):
   - Shared work items on the target project's boards: those boards group by the target project's own states, so shared items only appear in the shared list.
4. Languages: the app now ships English only (the other 21 locales were removed), so new strings need English text only.
5. Deploy: every push to `production` deploys through the GitHub workflow. The old stuck queued runs have been cancelled; nothing is blocking deploys.
6. Uploads: the API caps uploads at `FILE_SIZE_LIMIT` (bytes; 5 MB by default), separately from Caddy's 250MB `max_size`. It is set to 100 MB (`104857600`, the Cloudflare Free/Pro request limit) in the source `api.env`; on the server it goes in `/opt/plane/shared/api.env`, followed by `systemctl restart plane.target`.
7. Pre-commit hook: installing dependencies enables husky (`core.hooksPath=.husky/_`), which runs `pnpm lint-staged` and needs Node 22.22 and pnpm 11.10.0. The build machine has Node 20 and no pnpm, so the hook is currently off there (`core.hooksPath` unset). Run `oxfmt` and `oxlint --deny-warnings` on changed files by hand before committing.
