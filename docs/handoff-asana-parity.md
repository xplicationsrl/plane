# Handoff: Asana-parity work item features (`feat/asana-parity`)

Branch `feat/asana-parity`, based on `production` at `57de31e21`. Not merged and not deployed.

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

- Backend: 1436 passed. 18 failed, and the same 18 fail on the untouched `production` commit (magic-link auth and attachment storage need env not present locally). New tests: `test_issue_comment_replies_app`, `test_custom_property_app`, `test_time_entry_app`, `test_recurrence_app`, `tests/unit/utils/test_recurrence`, `test_template_app`, `test_intake_form_app`, `test_issue_project_link_app`.
- Frontend: `check:types` passes for web and space. Lint is clean on touched files. `packages/blocks/src/utils/duration.test.ts` (vitest) passes.
- Translations: every new string is in all 22 locales. sync-check is clean and ICU/placeholder checks pass.
- **Not done: nobody has clicked through the UI.** There was no browser on the build machine. Check each screen once before release.

## Left to do

1. **Manual UI pass** on a staging copy: sub-item checkbox and inline add; comment replies; each custom property type; timer and time log; repeat editor; template picker in the create form and in create-project; Forms settings and the public form page; "Also in" and the shared list.
2. **Set `NUM_PROXIES=1`** on the native install (behind Caddy) so the form rate limit keys on the real client IP. Without it, DRF keys on the X-Forwarded-For header, which a client can spoof.
3. Not built yet (deliberately scoped out):
   - Custom properties as list/spreadsheet columns and filters.
   - A global "timer running" indicator outside the work item.
   - Shared work items on the target project's boards: those boards group by the target project's own states, so shared items only appear in the shared list.
   - Editing a template's content in place (re-save it from a work item instead).
4. Existing Ukrainian template strings use "Темплейти"; the new ones use "шаблон". Do a sweep later.
5. Deploy: merge into `production` and the GitHub workflow deploys. Remember the old queued run noted earlier (`e28a15e85`) must be cancelled first, or deploys stay stuck.
