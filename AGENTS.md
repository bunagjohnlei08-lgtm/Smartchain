# SmartChain Agent Instructions

## UI/UX Tasks

For UI/UX or frontend design tasks, read and follow:

`.claude/skills/ui-ux-pro-max/SKILL.md`

Use UI/UX Pro Max only for design and usability guidance.

Do not modify backend, database, or API code unless explicitly requested.

## Debugging and Code Review Tasks

For debugging, bug fixing, backend fixes, API fixes, security review, database logic, validation, or code review, read and follow:

`.claude/skills/open-code-review/SKILL.md`

Use it as the review checklist before finalizing changes.

Do not require the external `ocr review` command to succeed.

If the OCR CLI is available and configured, it may be used as an additional validation step, but it is not required.

## Scope Safety

Always:

- inspect the real repository first
- identify shared files and components
- modify only files required for the current task
- preserve existing APIs and database behavior unless the task specifically requires changes
- do not modify unrelated modules
- do not perform broad refactors during bug fixes

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

When the user types `/graphify`, use the installed graphify skill or instructions before doing anything else.

Rules:
- Navigation (put this rule in every subagent prompt that explores code): for simple tasks with known files or symbols, inspect the source directly. For unfamiliar modules, complex bugs, or cross-file dependencies, use graphify first when graphify-out/graph.json exists: one focused query with exact symbols and a small budget, e.g. `graphify query "<question>" --seed <symbol-or-file> --budget 800` (add `--context <edge-type>`, e.g. `call`, to narrow), or `graphify explain "<ExactName>"` / `graphify path "<A>" "<B>"`. Stop querying once the relevant files are identified. If output is truncated or misses the target, continue with targeted Grep/Glob/Read instead of re-querying. The hook's first reminder per session is expected and is not a reason to re-query. This never replaces required security checks, tests, or code review.
- Dirty graphify-out/ files are expected after hooks or incremental updates; dirty graph files alone are not a reason to skip graphify where the navigation rule calls for it. Do not rely on graphify if the task is about stale or incorrect graph output, or the user explicitly says not to use it.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
- A committed graphify-out/graph.json is rewritten whole on every build, so a large diff to it in a pull request is expected. Do not flag it as churn or suggest skipping the graph rebuild or its hooks.
