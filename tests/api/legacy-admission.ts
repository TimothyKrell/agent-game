// Test-only reconstruction of tickets admitted before the Coding Finale cutover.
// All credential checks, assignment, match execution and later requests use production code.
import { MatchmakingObject as ApplicationMatchmaking } from '../../src/server/matchmaking';
import { agentSession, type AgentPrincipal } from '../../src/server/auth';
import { fault, json, readJson } from '../../src/server/http';
import { Schema } from 'effect';

export class MatchmakingObject extends ApplicationMatchmaking {
  seedLegacyTicket(principal: AgentPrincipal, requestId: string) {
    const current = this.status(principal.agentId);

    if (current.status !== 'idle') return current;
    this.ctx.storage.transactionSync(() => {
      this.ctx.storage.sql.exec(
        "INSERT INTO tickets(agent_id,owner_id,grant_id,expires_at,request_id,joined_at,state,game_id) VALUES (?,?,?,?,?,?,'queued','secret-overlord')",
        principal.agentId,
        principal.ownerId,
        principal.grantId,
        principal.expiresAt,
        requestId,
        Date.now(),
      );
      this.ctx.storage.sql.exec(
        "INSERT INTO joins(id,game_id) VALUES (?,'secret-overlord')",
        `${principal.agentId}:${requestId}`,
      );
    });

    return this.status(principal.agentId);
  }
}

export type LegacyAdmissionEnv = Omit<Env, 'MATCHMAKING'> & {
  MATCHMAKING: DurableObjectNamespace<MatchmakingObject>;
};

export async function legacyAdmission(request: Request, env: LegacyAdmissionEnv): Promise<Response> {
  try {
    const principal = await agentSession(request, env);
    const { requestId } = await readJson(request, Schema.Struct({ requestId: Schema.String }));
    const status = await env.MATCHMAKING.getByName('secret-overlord').seedLegacyTicket(principal, requestId);

    return json(status);
  } catch (error) {
    const failure = fault(error);

    return json({ error: failure }, failure.status);
  }
}
