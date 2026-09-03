---
name: open-code-review
description: Review debugging, bug fixes, backend and API changes, database logic, validation, security, regressions, error handling, and code quality using repository-local guidance without requiring the OpenCodeReview CLI.
---

# OpenCodeReview Skill

## Purpose

Use this skill when performing:

- debugging
- bug fixes
- backend changes
- API fixes
- database-related logic review
- validation
- security review
- regression review
- error handling review
- code quality review

This skill is used as local static review guidance.

Do not require the OpenCodeReview CLI or external API to run.

## Debugging Workflow

When debugging:

1. Inspect the actual repository first.
2. Trace the real execution path.
3. Inspect frontend, backend, database, API, and related models only when relevant.
4. Identify the root cause before changing code.
5. Do not guess table names, column names, statuses, routes, payloads, or relationships.
6. Use the real project schema and existing application logic as the source of truth.
7. Apply the smallest correct fix.
8. Avoid unrelated refactoring.

## Code Review Checklist

After implementing a fix, review the changed code for:

### Correctness

- Does the fix address the actual root cause?
- Are edge cases handled?
- Are null, empty, invalid, and unexpected values handled correctly?
- Are status comparisons consistent with actual stored values?
- Are date/time and timezone assumptions correct?

### Backend / API

- Validate request payloads.
- Check HTTP methods and status codes.
- Check authorization and role restrictions.
- Check Laravel validation.
- Check model relationships.
- Check N+1 query risks.
- Check duplicate counting.
- Check transaction safety when applicable.

### Database

- Do not invent schema.
- Confirm real tables and columns.
- Avoid unnecessary migrations.
- Avoid destructive queries.
- Preserve data integrity.
- Verify aggregation/grouping logic.
- Verify date filtering and joins.

### Frontend

- Do not introduce mock fallback data when real API data exists.
- Preserve existing backend integration.
- Check loading, empty, and error states.
- Check field mapping between API response and UI.
- Avoid unrelated UI changes during debugging tasks.

### Security

- Check authentication.
- Check authorization.
- Check validation.
- Check mass assignment risks.
- Check SQL injection risks.
- Check unsafe raw queries.
- Check sensitive data exposure.
- Check role-based access control.

### Regression Safety

- Identify shared components before modifying them.
- Avoid changes that can affect unrelated Admin, Plant Manager, QA, or other modules.
- Preserve existing routes and API contracts unless explicitly required.

## Validation

After changes:

- run relevant PHP syntax checks
- run Laravel route/tests when applicable
- run frontend lint/type-check/build when applicable
- do not fix unrelated pre-existing errors

## Final Response

Report:

1. Root cause
2. Exact files modified
3. What was changed
4. OpenCodeReview checklist findings
5. Validation performed
6. Any remaining unrelated issues
7. Confirmation that unrelated modules were not modified
