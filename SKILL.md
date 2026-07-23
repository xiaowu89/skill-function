---
name: skill-function
description: Review code changes for bugs, regressions, unsafe patterns,
  and missing tests. Use when the user asks for code review, diff review,
  PR review, or risk analysis on changes.
compatibility: Designed for coding agents with file read and diff access
---

# Code Review

When invoked:

1. Read the diff or files the user points to
2. Check for bugs and edge cases
3. Identify unsafe patterns
4. Suggest test coverage gaps
5. Produce a structured review with severity ratings
