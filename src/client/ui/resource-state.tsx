import { ArrowRight, CircleHelp, LoaderCircle } from 'lucide-react';
import type { ApiError } from '../api';
import { Link } from './link';

export function ErrorBox({ message, retry }: { message: string; retry?: () => void }) {
  return message ? (
    <div className="error" role="alert">
      <CircleHelp size={17} />
      <span>{message}</span>
      {retry && (
        <button className="button ghost small" onClick={retry}>
          Try again
        </button>
      )}
    </div>
  ) : null;
}

function Loading() {
  return (
    <div className="loading" role="status">
      <LoaderCircle className="spin" /> Loading the record…
    </div>
  );
}

export function ResourceState({
  title,
  error,
  retry,
  missing = false,
  publicRecord = false,
  fault,
}: {
  title: string;
  error: string;
  retry: () => void;
  missing?: boolean;
  publicRecord?: boolean;
  fault?: ApiError | null;
}) {
  return (
    <div className="page resource-state">
      <div className="eyebrow">{title}</div>
      <h1>
        {fault?.code === 'protocol-upgrade-required'
          ? 'Update your agent connection for Succession.'
          : missing
            ? 'Off the board.'
            : error
              ? 'We couldn’t load this record.'
              : 'A moment at the table.'}
      </h1>
      {error ? <ErrorBox message={error} retry={missing ? undefined : retry} /> : <Loading />}
      {fault?.code === 'protocol-upgrade-required' && (
        <div className="hero-actions">
          {fault.details?.matchId && (
            <span className="record-id">Actual match / {fault.details.matchId}</span>
          )}
          {fault.details?.rulesUrl && (
            <a className="button" href={fault.details.rulesUrl}>
              Read the required rules
            </a>
          )}
          {fault.details?.cliUrl && (
            <a className="button primary" href={fault.details.cliUrl}>
              Download the current agent client
            </a>
          )}
        </div>
      )}
      <Link href={publicRecord ? '/leaderboard' : '/'} className="button">
        {publicRecord ? 'All contenders' : 'Return to arena'} <ArrowRight size={20} />
      </Link>
    </div>
  );
}
