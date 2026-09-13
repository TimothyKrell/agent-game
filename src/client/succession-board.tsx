import { Check, Coins, Crown, Eye, Shield, Skull, X } from 'lucide-react';
import type { Observation2 } from '../shared/succession';
import { Emblem, InfluenceBack, SuccessionSeal } from './deco';
import { useMotionEntry } from './motion';

export function SuccessionBoard({
  view,
}: {
  view: Pick<Observation2, 'board' | 'seats' | 'round' | 'act1Result' | 'status' | 'result' | 'phase'>;
}) {
  const board = view.board;

  return (
    <section className={`game-board succession-board act-${board.act}`} aria-label={`Act ${board.act} board`}>
      <div className="board-header">
        <span className="mono">THE TEN · ACT {board.act}</span>
        <span className="mono">
          {board.act === 1
            ? `ELECTION ROUND ${view.round}`
            : `TABLE ROUND ${board.tableRound} / ${board.roundCap}`}
        </span>
      </div>
      {board.act === 1 && (
        <div className="policy-tracks">
          <SuccessionPolicyTrack type="safeguard" count={board.tracks.safeguards} />
          <SuccessionPolicyTrack type="override" count={board.tracks.overrides} />
        </div>
      )}
      <div className="seat-overflow-hint">All ten seats · Scroll to browse →</div>
      <div className="seat-grid" tabIndex={0} role="region" aria-label="All ten participants">
        {view.seats.map((seat, index) => {
          const active =
            board.act === 1 ? seat.number === board.coordinator : seat.number === board.activeSeat;

          const champion = view.result?.winnerSeat === seat.number;
          const bonus = view.act1Result?.bonuses[seat.number];
          const role = board.act === 2 ? view.act1Result?.roles[seat.number] : seat.role;

          return (
            <div
              key={seat.number}
              className={`seat ${!seat.alive ? 'eliminated' : ''} ${active ? 'coordinator' : ''} ${champion ? 'champion' : ''}`}
            >
              <span className="seat-number">{String(seat.number + 1).padStart(2, '0')}</span>
              {board.act === 1 && (
                <div className={`avatar tone-${index % 5}`}>
                  <Emblem variant={index} />
                  <span className="avatar-monogram">{seat.name.slice(0, 2).toUpperCase()}</span>
                </div>
              )}
              <a href={`/agents/${encodeURIComponent(seat.agentId)}?gameId=succession`}>{seat.name}</a>
              <small>
                {seat.originalHouse ? 'House entrant' : 'External entrant'}
                {!seat.forfeited && <span>{seat.house ? 'House-controlled' : 'Original controller'}</span>}
                {seat.forfeited && <span>Forfeited · House controller</span>}
                {!seat.alive && (
                  <span>
                    {board.act === 1 ? 'Executed in Act 1 · Returns in Act 2' : 'Eliminated in Act 2'}
                  </span>
                )}
                {active && view.status === 'active' && (
                  <span>{board.act === 1 ? 'Coordinator' : 'Active seat'}</span>
                )}
                {board.act === 2 && board.pending?.target === seat.number && <span>Target</span>}
                {board.act === 1 && board.executor === seat.number && (
                  <span>
                    {['nomination', 'government-discussion', 'voting'].includes(view.phase.kind)
                      ? 'Executor nominee'
                      : 'Executor'}
                  </span>
                )}
              </small>
              {board.act === 1 && seat.vote !== undefined && (
                <span
                  className={`ballot ${seat.vote ? 'yes' : 'no'}`}
                  aria-label={seat.vote ? 'Approved government' : 'Rejected government'}
                >
                  {seat.vote ? <Check size={12} /> : <X size={12} />}
                </span>
              )}
              {board.act === 2 && (
                <>
                  <div className="seat-resources">
                    <span>
                      <Coins size={14} /> {seat.coins ?? '—'} coins
                    </span>
                    <span>
                      <Shield size={14} /> {seat.influence ?? '—'} influence
                    </span>
                  </div>
                  <div className="influence-backs" aria-hidden="true">
                    {Array.from({ length: seat.influence ?? 0 }, (_, card) => (
                      <InfluenceBack key={card} />
                    ))}
                  </div>
                  {view.act1Result && (
                    <span className="returned-marker">
                      {view.act1Result.returnedSeats.includes(seat.number)
                        ? 'Returned after execution'
                        : 'Returned for Act 2'}
                    </span>
                  )}
                  {bonus === 1 && <span className="bonus-marker">+1 coin · Act 1 faction bonus</span>}
                  {seat.revealed && seat.revealed.length > 0 && (
                    <small className="revealed-influence">Lost: {seat.revealed.join(', ')}</small>
                  )}
                </>
              )}
              {role && (
                <span className={`badge ${role === 'cooperative' ? 'green' : 'red'}`}>
                  {board.act === 2 ? 'Act 1: ' : ''}
                  {role}
                </span>
              )}
              {champion && (
                <span className="champion-marker">
                  <Crown size={14} /> Winning seat
                </span>
              )}
              {champion && seat.forfeited && <small>Original entrant: forfeit loss</small>}
            </div>
          );
        })}
      </div>
      <div className="board-footer">
        {board.act === 1 ? (
          <>
            <span>
              Election tracker <b>{board.tracks.electionTracker} / 3</b>
            </span>
            <span>
              {board.tracks.drawCount} draw · {board.tracks.discardCount} discarded
            </span>
            <span>{board.tracks.vetoUnlocked ? 'VETO UNLOCKED' : 'VETO LOCKED'}</span>
          </>
        ) : (
          <>
            <span>
              Court deck <b>{board.courtCount} cards</b>
            </span>
            <span>{view.seats.filter((seat) => seat.alive).length} living seats</span>
            <span>Cap: influence → coins → committed priority</span>
          </>
        )}
      </div>
    </section>
  );
}

export function SuccessionPolicyTrack({ type, count }: { type: 'safeguard' | 'override'; count: number }) {
  const total = type === 'safeguard' ? 5 : 6;
  const Icon = type === 'safeguard' ? Shield : Skull;

  return (
    <div className={`policy-track ${type}`}>
      <div>
        <span>
          <Icon size={15} />
          {type === 'safeguard' ? 'SAFEGUARDS' : 'OVERRIDES'}
        </span>
        <b>
          {count}
          <small> / {total}</small>
        </b>
      </div>
      <div className="track-slots">
        {Array.from({ length: total }, (_, index) => (
          <div key={index} className={index < count ? 'filled' : ''}>
            {index < count ? (
              <Icon size={17} />
            ) : (
              <span>{type === 'override' ? ['⌕', '⌕', '↗', '×', '×', '♛'][index] : index + 1}</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export function SuccessionResult({ view }: { view: Observation2 }) {
  const entry = useMotionEntry(view.status === 'interrupted' ? 'partial' : 'result');
  const result = view.result;
  const champion = result && view.seats.find((seat) => seat.number === result.winnerSeat);

  return (
    <section
      ref={entry}
      className={`match-result succession-result ${view.status === 'interrupted' ? 'interrupted' : ''}`}
    >
      <div className="result-banner">
        <div>
          <div className="eyebrow">
            SUCCESSION / {view.status === 'interrupted' ? 'THE PARTIAL RECORD' : 'ONE WINNING SEAT'}
          </div>
          <h1>{view.status === 'interrupted' ? 'Match interrupted.' : 'One champion.'}</h1>
          {champion && <h2>{champion.name}</h2>}
          <p>
            {view.status === 'interrupted'
              ? `${view.interruptionReason ?? 'The match could not finish reliably.'} No champion. No rated result.`
              : result?.reason === 'round-cap'
                ? 'Twelve table rounds complete. The published tiebreak selects one champion.'
                : 'The last surviving seat is champion.'}
          </p>
          {champion?.forfeited && (
            <p className="forfeit-result">
              House-controlled winning seat · {champion.name}, the original entrant, receives a forfeit loss.
              No credited agent win is reassigned.
            </p>
          )}
        </div>
        {view.status === 'finished' && <SuccessionSeal />}
      </div>
      <div className="result-metadata">
        <span className="record-id">Table / {view.matchId}</span>
        <p>
          {view.mode === 'ranked' ? 'Ranked · Succession standings' : `Unranked ${view.mode}`} · Both acts in
          one match<span className="archive-status">Archived</span>
        </p>
      </div>
      {view.act1Result && (
        <p className="act1-result-note">
          Act 1: {view.act1Result.team} faction victory · {view.act1Result.reason}. This awarded a +1 coin
          starting bonus, not a match win.
        </p>
      )}
      {view.act1Result && (
        <section aria-label="Final Act 1 policy tracks">
          <h2>Final Act 1 tracks</h2>
          <div className="policy-tracks">
            <SuccessionPolicyTrack type="safeguard" count={view.act1Result.finalTracks.safeguards} />
            <SuccessionPolicyTrack type="override" count={view.act1Result.finalTracks.overrides} />
          </div>
        </section>
      )}
      {result?.tieBreak && (
        <section className="cap-evidence">
          <h2>Cap tiebreak · Decided by {result.tieBreak.decisive}</h2>
          <table>
            <thead>
              <tr>
                <th>Surviving seat</th>
                <th>Influence</th>
                <th>Coins</th>
                <th>Priority</th>
              </tr>
            </thead>
            <tbody>
              {result.tieBreak.scores.map((score) => (
                <tr key={score.seat}>
                  <th scope="row">
                    {view.seats.find((seat) => seat.number === score.seat)?.name ?? `Seat ${score.seat + 1}`}
                  </th>
                  <td>{score.influence}</td>
                  <td>{score.coins}</td>
                  <td>{score.priority}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
      <details className="tie-commitment">
        <summary>Precommitted final-tie priority</summary>
        <p>SHA-256 commitment</p>
        <code>{view.commitment.digest}</code>
        {view.commitment.reveal && (
          <>
            <p>
              Revealed salt: <code>{view.commitment.reveal.saltBase64url}</code>
            </p>
            <p>Priority seat order: {view.commitment.reveal.priority.map((seat) => seat + 1).join(' → ')}</p>
          </>
        )}
      </details>
    </section>
  );
}

export function SuccessionPrivacy({ view }: { view: Observation2 }) {
  return (
    <div className="spectator-note">
      <Eye size={18} />
      <p>
        {view.status !== 'active'
          ? 'Public archive · Both acts are revealed. Replay frames describe historical state and never grant live controls.'
          : view.you?.forfeited && !view.private
            ? 'Your original controller has been replaced. Prior entitled history remains readable; new private cards and decisions belong to the house controller.'
            : view.you
              ? 'Your hand and legal decisions are private to your current controller. Other seats see only public claims and resources.'
              : 'Public spectator · Live hands and uncommitted reactions remain private. Act 1 roles become historical in Act 2; the full game record is revealed only when the match ends.'}
      </p>
    </div>
  );
}
