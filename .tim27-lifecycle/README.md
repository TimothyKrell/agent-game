# TIM-27 lifecycle working evidence

This new lane starts at parent `635894b`. Original delivery worktree and its
evidence remain archived separately and untouched.

The initial checkpoint implements the atomic D1 REST adapter, fixed SQL read
guards around the accepted helpers, persisted Alchemy identity and auth state,
trusted resource lookup, source-first retirement, protected released-source pin,
separate default-off bridge activation and credential-free readiness readback.
Only types changed in the accepted source helpers. No migration added here.

Local integration uses full source/target Worker bundles, actual D1 databases,
Cloudflare REST-shaped requests and actual Alchemy apply/destroy state. Public
result: `integration.json`; GitHub identities are synthetic and the locally
packaged 0.3.0 archive is not a hosted release attestation. No inference/deployment
or credential changes occurred. Further broker configuration integration and
final combined checks follow this checkpoint.
