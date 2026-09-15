# Production-first release gates

The owner approved shipping production UI and pictures before completing hosted preview activation. Preview activation remains disabled.

CI now partitions the existing71-file default Vitest inventory without omissions or overlap:

- **Production release:**65 files, still distributed across three serial-worker shards. Build/lint/types, browser, API/recovery and provider checks remain required by the production deployment job. Its deployed-arena smoke check remains in place.
- **Preview activation:** six files in a separate credential-free job: installed playable journeys, preview smoke and four positive-control files. This job is not a production dependency. It retains its25-minute limit and uploads diagnostics on failure.

The trusted preview controller explicitly requires the additional **Preview activation tests** job from the exact successful GitHub attempt. Missing or failed activation verification is rejected even if production release checks pass. The existing default-off activation and dedicated-credential requirements remain in force. There is no `continue-on-error` bypass.

The default local `npm test` still covers the complete inventory. Use `vitest.release.config.ts` and `vitest.preview-activation.config.ts` for the separate lanes. Actual Vitest file discovery verified65+6=71 with no overlap. The49 focused GitHub/workflow cases pass, including explicit missing/failed activation controls; lint and types pass. An initial test-schema mismatch for GitHub's string-valued `needs` was corrected to support both valid string and array forms.

Completed local reviews are not repeated. The disk-backed parent playable run may finish independently. Hosted release CI, production deployment and its smoke readback remain the delivery gates; extended preview acceptance and further archive consolidation follow separately.
