---
description: Review the staged git diff against project conventions
allowed-tools: Bash(git diff:*)
---

Review the following staged git diff:

```diff
!`git diff --staged`
```

If the diff is empty, respond: "No staged changes to review." and stop.

Check for:

- [ ] Scope: no unrelated files or unrelated behavior changes
- [ ] Style: naming conventions match the project and CLAUDE.md
- [ ] API behavior: response format is consistent with existing endpoints
- [ ] Error handling: validation errors return HTTP 400 with `{ "error": "message" }`
- [ ] Tests: new code has corresponding Jest/Supertest tests
- [ ] Test isolation: database tests set `process.env.DB_PATH = ':memory:'` before requiring `app`
- [ ] Security: no hardcoded secrets, SQL uses prepared statements / parameterized queries, and user input is not concatenated into SQL strings

Output a numbered list of findings.

For each finding, include:
- Severity: High / Medium / Low
- File and line number if possible
- What the issue is
- Why it matters
- Suggested fix

Treat High findings as blocking. If there are no High findings, say: "No blocking issues found."