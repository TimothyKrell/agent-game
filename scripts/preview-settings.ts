import { Schema } from 'effect';
import { requireCondition } from './preview-artifact.ts';

const Released = Schema.Struct({
  sourceOrigin: Schema.String,
  executable: Schema.Struct({
    url: Schema.String,
    sha256: Schema.String,
    bytes: Schema.Number,
    version: Schema.String,
    protocols: Schema.Tuple([Schema.Literal(1), Schema.Literal(2)]),
  }),
});

/** Node-safe protected settings parser; no Alchemy or server runtime imports. */
export function bridgeSettings(env: NodeJS.ProcessEnv) {
  if (env.PREVIEW_IDENTITY_ENABLED !== 'true') return undefined;
  const text = env.PREVIEW_SOURCE_RELEASE ?? '';
  requireCondition(
    Buffer.byteLength(text) <= 4096 && text.length > 0,
    'Configure the independently released source CLI pin before enabling preview identity',
  );
  const settings = Schema.decodeUnknownSync(Released)(JSON.parse(text), { onExcessProperty: 'error' });
  const origin = new URL(settings.sourceOrigin);
  requireCondition(
    origin.protocol === 'https:' && origin.origin === settings.sourceOrigin,
    'Invalid trusted source origin',
  );

  return settings;
}
