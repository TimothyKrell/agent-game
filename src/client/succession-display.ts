import type { Observation2, PhaseKind2 } from '../shared/succession';

const labels: Record<PhaseKind2, string> = {
  'nomination-discussion': 'Nomination discussion',
  nomination: 'Executor nomination',
  'government-discussion': 'Government discussion',
  voting: 'Government vote',
  'coordinator-discard': 'Coordinator discard',
  'executor-policy': 'Executor policy',
  'veto-response': 'Veto response',
  'executive-discussion': 'Executive discussion',
  'executive-action': 'Executive action',
  finished: 'Complete record',
  interrupted: 'Interrupted match',
  'act-2:discussion': 'Turn discussion',
  'act-2:action': 'Choose action',
  'act-2:challenge': 'Challenge the action claim',
  'act-2:block': 'Target may block',
  'act-2:loss': 'Choose influence to lose',
  'act-2:exchange': 'Private exchange',
  'act-2:finished': 'Complete record',
};

export function successionPhaseLabel(view: Pick<Observation2, 'board' | 'phase'>) {
  if (view.phase.kind === 'act-2:challenge' && view.board.act === 2 && view.board.pending?.block)
    return 'Challenge the block';

  return labels[view.phase.kind];
}
