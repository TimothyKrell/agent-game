import type { GameId } from '../game/contracts';
import { gameDescriptor } from '../game/descriptors';
import { GameError } from '../game/types';
import type {
  PreviewBrokerIntent,
  PreviewBrokerReceipt,
  PreviewBrokerStatus,
} from '../shared/preview-broker';
import { previewAllocationIdentity } from '../shared/preview-broker';
import type { MatchInitialization } from './coordinator';
import { opaqueId } from './http';
import { previewTarget } from './preview-config';
import { previewBrokerConfiguration } from './preview-broker-config';
import {
  allocatePreview,
  closePreviewAllocation,
  previewCapabilities,
  validatePreviewAllocation,
} from './preview-broker-client';

export interface PreviewQueueTicket {
  agent_id: string;
  owner_id: string;
  grant_id: string;
  request_id: string;
  game_id: GameId;
  joined_at: number;
  expires_at: number;
}

type Pending = {
  match_id: string;
  intent: string;
  receipt: string | null;
  init_dispatched: number;
  closed: number;
};

/** Target-local write-ahead intent and recovery. This table is never a second operating ledger. */
export class PreviewTargetAllocations {
  private cleaning = false;

  constructor(
    private readonly ctx: DurableObjectState,
    private readonly env: Env,
  ) {
    ctx.storage.sql.exec(`CREATE TABLE IF NOT EXISTS preview_target_allocations (
      match_id TEXT PRIMARY KEY,intent TEXT NOT NULL,receipt TEXT,init_dispatched INTEGER NOT NULL DEFAULT 0,
      closed INTEGER NOT NULL DEFAULT 0,cleanup_pending INTEGER NOT NULL DEFAULT 0,retry_at INTEGER NOT NULL DEFAULT 0)`);
    ctx.storage.sql.exec(
      'CREATE TABLE IF NOT EXISTS preview_capacity(id INTEGER PRIMARY KEY CHECK(id=1),data TEXT NOT NULL,checked_at INTEGER NOT NULL)',
    );
  }

  async refresh(): Promise<void> {
    const capacity = await previewCapabilities(this.env);
    this.ctx.storage.sql.exec(
      'INSERT INTO preview_capacity VALUES (1,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data,checked_at=excluded.checked_at',
      JSON.stringify(capacity),
      Date.now(),
    );
  }

  capacity(gameId: GameId): 'available' | 'busy' | 'budget' {
    if (gameId === 'coding-finale') return 'busy';

    const row = this.ctx.storage.sql
      .exec<{ data: string; checked_at: number }>('SELECT data,checked_at FROM preview_capacity WHERE id=1')
      .toArray()[0];

    if (!row || row.checked_at < Date.now() - 30000) return 'busy';
    const status: PreviewBrokerStatus = JSON.parse(row.data);

    return (gameId === 'succession' ? status.succession : status.secretOverlord).capacity;
  }

  async prepare(
    matchId: string,
    tickets: PreviewQueueTicket[],
    gameId: GameId,
  ): Promise<PreviewBrokerIntent> {
    if (gameId === 'coding-finale')
      throw new GameError('game-unavailable', 'Coding Finale requires a sandbox-enabled deployment.', 503);
    const target = await previewTarget(this.env);
    const descriptor = gameDescriptor(gameId);
    const authority = [];

    for (const ticket of tickets) {
      const row = await this.env.DB.prepare(
        "SELECT handoff_id FROM preview_authorities WHERE kind='grant' AND local_id=? AND incarnation=? AND expires_at>?",
      )
        .bind(ticket.grant_id, target.incarnation, Date.now())
        .first<{ handoff_id: string }>();

      if (!row) throw new GameError('preview-authority', 'Ticket lacks source authority.', 401);
      authority.push({
        agentId: ticket.agent_id,
        ownerId: ticket.owner_id,
        grantId: ticket.grant_id,
        handoffId: row.handoff_id,
        queueRequestId: ticket.request_id,
        joinedAt: ticket.joined_at,
        expiresAt: ticket.expires_at,
      });
    }

    return {
      requestId: opaqueId('allocation'),
      targetMatchId: matchId,
      targetOrigin: target.origin,
      incarnation: target.incarnation,
      commit: target.commit,
      gameId,
      rulesVersion: descriptor.rulesVersion,
      policyVersion: descriptor.housePolicyVersion,
      tickets: authority,
    };
  }

  persist(intent: PreviewBrokerIntent): void {
    this.ctx.storage.sql.exec(
      'INSERT INTO preview_target_allocations(match_id,intent) VALUES (?,?)',
      intent.targetMatchId,
      JSON.stringify(intent),
    );
  }

  private pending(matchId: string): Pending | undefined {
    return this.ctx.storage.sql
      .exec<Pending>('SELECT * FROM preview_target_allocations WHERE match_id=?', matchId)
      .toArray()[0];
  }

  canCancel(matchId: string): boolean {
    const row = this.pending(matchId);

    return !!row && !row.init_dispatched;
  }

  receipt(matchId: string): PreviewBrokerReceipt {
    const row = this.pending(matchId);

    if (!row || row.closed || !row.receipt)
      throw new GameError('preview-allocation-closed', 'No live source allocation.', 409);

    return JSON.parse(row.receipt);
  }

  private exactTickets(intent: PreviewBrokerIntent): boolean {
    return intent.tickets.every(
      (ticket) =>
        this.ctx.storage.sql
          .exec(
            `SELECT agent_id FROM tickets WHERE
      agent_id=? AND owner_id=? AND grant_id=? AND request_id=? AND game_id=? AND joined_at=? AND expires_at=?
      AND expires_at>? AND state='starting' AND match_id=?`,
            ticket.agentId,
            ticket.ownerId,
            ticket.grantId,
            ticket.queueRequestId,
            intent.gameId,
            ticket.joinedAt,
            ticket.expiresAt,
            Date.now(),
            intent.targetMatchId,
          )
          .toArray().length === 1,
    );
  }

  private async locallyAuthorized(intent: PreviewBrokerIntent): Promise<boolean> {
    const [target, config] = await Promise.all([
      previewTarget(this.env),
      previewBrokerConfiguration(this.env),
    ]);

    if (
      target.incarnation !== intent.incarnation ||
      target.commit !== intent.commit ||
      config.revision !== intent.commit ||
      !this.exactTickets(intent)
    )
      return false;

    for (const ticket of intent.tickets) {
      const valid = await this.env.DB.prepare(
        `SELECT g.id FROM agent_grants g JOIN agents a ON a.id=g.agent_id
        JOIN preview_authorities p ON p.kind='grant' AND p.local_id=g.id
        WHERE g.id=? AND a.id=? AND a.owner_id=? AND g.revoked_at IS NULL AND g.expires_at>?
        AND a.retired_at IS NULL AND p.handoff_id=? AND p.incarnation=? AND p.expires_at>?`,
      )
        .bind(
          ticket.grantId,
          ticket.agentId,
          ticket.ownerId,
          Date.now(),
          ticket.handoffId,
          intent.incarnation,
          Date.now(),
        )
        .first();

      if (!valid) return false;
    }

    return this.exactTickets(intent);
  }

  /** Resolve the durable broker intent before the queue commits participation. */
  async finish(input: MatchInitialization): Promise<'ordinary' | 'initialized' | 'abandoned'> {
    const row = this.pending(input.id);

    if (!row) return 'ordinary';
    const intent: PreviewBrokerIntent = JSON.parse(row.intent);
    let receipt: PreviewBrokerReceipt | null = row.receipt ? JSON.parse(row.receipt) : null;
    const match = this.env.MATCHES.getByName(input.id);

    const initialization = (saved: PreviewBrokerReceipt): MatchInitialization => ({
      ...input,
      snapshot: saved.snapshot,
      reservationUsd: saved.reservationUsd,
    });

    // An acknowledgement may have been lost after the real game and its initialization fields committed.
    if (receipt && (await match.initializationReceipt(initialization(receipt)))) return 'initialized';

    if (row.closed) return 'abandoned';

    try {
      if (!(await this.locallyAuthorized(intent))) {
        this.abandon(intent);

        return 'abandoned';
      }

      receipt = receipt
        ? await validatePreviewAllocation(this.env, receipt)
        : await allocatePreview(this.env, intent);

      if (previewAllocationIdentity(receipt.intent) !== previewAllocationIdentity(intent) || receipt.closed)
        throw new GameError(
          'preview-conflict',
          'Source allocation does not match the persisted intent.',
          409,
        );
      this.ctx.storage.sql.exec(
        'UPDATE preview_target_allocations SET receipt=? WHERE match_id=?',
        JSON.stringify(receipt),
        input.id,
      );
      this.ctx.storage.sql.exec(
        'UPDATE allocations SET snapshot=?,reservation=? WHERE id=?',
        JSON.stringify(receipt.snapshot),
        receipt.reservationUsd,
        input.id,
      );

      // Both local authority and exact ticket membership may have changed during source I/O.
      if (!(await this.locallyAuthorized(intent))) {
        this.abandon(intent);

        return 'abandoned';
      }

      this.ctx.storage.sql.exec(
        'UPDATE preview_target_allocations SET init_dispatched=1 WHERE match_id=?',
        input.id,
      );
      await match.initialize(initialization(receipt));

      return 'initialized';
    } catch (error) {
      if (error instanceof GameError && error.status < 500) {
        // A concurrent initializer may have committed before an error reached this caller.
        if (receipt && (await match.initializationReceipt(initialization(receipt)))) return 'initialized';
        this.abandon(intent);

        return 'abandoned';
      }

      throw error;
    }
  }

  private abandon(intent: PreviewBrokerIntent): void {
    this.ctx.storage.transactionSync(() => {
      this.close(intent.targetMatchId);
      this.ctx.storage.sql.exec("UPDATE allocations SET state='settled' WHERE id=?", intent.targetMatchId);

      for (const ticket of intent.tickets)
        this.ctx.storage.sql.exec(
          'UPDATE joins SET cancelled=1 WHERE id=? AND match_id IS NULL',
          `${ticket.agentId}:${ticket.queueRequestId}`,
        );
      this.ctx.storage.sql.exec('DELETE FROM tickets WHERE match_id=?', intent.targetMatchId);
    });
  }

  recoverParticipation(matchId: string): void {
    const row = this.pending(matchId);

    if (!row) return;
    const intent: PreviewBrokerIntent = JSON.parse(row.intent);

    for (const ticket of intent.tickets)
      this.ctx.storage.sql.exec(
        'UPDATE joins SET match_id=? WHERE id=?',
        matchId,
        `${ticket.agentId}:${ticket.queueRequestId}`,
      );
  }

  close(matchId: string): void {
    this.ctx.storage.sql.exec(
      'UPDATE preview_target_allocations SET closed=1,cleanup_pending=1,retry_at=? WHERE match_id=?',
      Date.now(),
      matchId,
    );
  }

  cleanupAt(): number | null {
    return this.ctx.storage.sql
      .exec<{ at: number | null }>(
        'SELECT min(retry_at) AS at FROM preview_target_allocations WHERE cleanup_pending=1',
      )
      .one().at;
  }

  dispatchCleanup(): void {
    if (this.cleaning) return;

    const row = this.ctx.storage.sql
      .exec<Pending>(
        'SELECT * FROM preview_target_allocations WHERE cleanup_pending=1 AND retry_at<=? LIMIT 1',
        Date.now(),
      )
      .toArray()[0];

    if (!row) return;
    this.ctx.storage.sql.exec(
      'UPDATE preview_target_allocations SET retry_at=? WHERE match_id=?',
      Date.now() + 30000,
      row.match_id,
    );
    this.cleaning = true;
    const intent: PreviewBrokerIntent = JSON.parse(row.intent);
    this.ctx.waitUntil(
      closePreviewAllocation(this.env, `preview_${intent.requestId}`, intent.incarnation)
        .then(() => {
          this.ctx.storage.sql.exec(
            'UPDATE preview_target_allocations SET cleanup_pending=0 WHERE match_id=?',
            row.match_id,
          );
        })
        .catch(() => {
          console.warn(JSON.stringify({ event: 'preview_allocation_cleanup_retry', matchId: row.match_id }));
        })
        .finally(() => {
          this.cleaning = false;
        }),
    );
  }
}
