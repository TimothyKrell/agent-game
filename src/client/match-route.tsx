import { Match, Schema } from 'effect';
import { ObservationSchema } from '../shared/api';
import { Observation2Schema } from '../shared/succession';
import { Observation3Schema } from '../shared/coding-finale';
import { SecretOverlordMatch } from './secret-overlord-match';
import { SuccessionMatch } from './succession-match';
import { CodingFinaleMatch } from './coding-finale-match';
import { ResourceState } from './ui/resource-state';
import { useLoad } from './use-load';

const MatchObservationSchema = Schema.Union([ObservationSchema, Observation2Schema, Observation3Schema]);

export function MatchRoute({ id }: { id: string }) {
  const { data, error, fault, refresh } = useLoad(
    `/api/matches/${encodeURIComponent(id)}`,
    MatchObservationSchema,
  );

  if (!data) return <ResourceState title="Match record" error={error} fault={fault} retry={refresh} />;

  return Match.value(data).pipe(
    Match.when({ protocolVersion: '3' }, (view) => <CodingFinaleMatch initial={view} />),
    Match.when({ protocolVersion: '2' }, (view) => <SuccessionMatch initial={view} />),
    Match.orElse((view) => <SecretOverlordMatch initial={view} />),
  );
}
