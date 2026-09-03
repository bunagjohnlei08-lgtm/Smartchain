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
