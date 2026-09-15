# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: continuous-story.spec.ts >> retains the pre-replacement document anchor across forward tall-to-omitted windows
- Location: e2e/continuous-story.spec.ts:457:5

# Error details

```
Error: Channel closed
```

```
Error: locator.evaluate: Target page, context or browser has been closed
Call log:
  - waiting for getByLabel('primary timeline', { exact: true }).locator('[data-story-key="story-392621076-236"]')

```

```
Error: browserContext._wrapApiCall: Target page, context or browser has been closed
```