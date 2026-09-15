import { Schema } from 'effect';
import { ObservationSchema } from '../shared/api';
import { Observation2Schema } from '../shared/succession';
import { SecretOverlordMatch } from './secret-overlord-match';
import { SuccessionMatch } from './succession-match';
import { ResourceState } from './ui/resource-state';
import { useLoad } from './use-load';

const MatchObservationSchema = Schema.Union([ObservationSchema, Observation2Schema]);

export function MatchRoute({ id }: { id: string }) {
  const { data, error, fault, refresh } = useLoad(
    `/api/matches/${encodeURIComponent(id)}`,
    MatchObservationSchema,
  );

  if (!data) return <ResourceState title="Match record" error={error} fault={fault} retry={refresh} />;

  return data.protocolVersion === '2' ? (
    <SuccessionMatch initial={data} />
  ) : (
    <SecretOverlordMatch initial={data} />
  );
}
