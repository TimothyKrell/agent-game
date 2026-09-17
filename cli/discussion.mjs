const scope = (view) => JSON.stringify([view.matchId, view.history?.visibilityEpoch, view.you?.generation]);

const pendingReplies = (walk, now) =>
  (walk?.awaitingReply ?? []).filter((message) => now - message.at <= 180_000).slice(-3);

export function unreadDiscussion(state, view) {
  return (
    view?.protocolVersion === '3' &&
    view.act === 1 &&
    view.status === 'active' &&
    view.history.streamHead > 0 &&
    (state.discussionWalk?.scope !== scope(view) || state.discussionWalk.cursor < view.history.streamHead)
  );
}

/** Deliver one bounded entitled page alongside fresh state, independently of explicit archive paging. */
export async function discussion({ view, client, state, remember, change, reset = false }) {
  if (view.protocolVersion !== '3' || view.act !== 1 || view.status !== 'active') return { view };

  if (view.decision || view.you?.canReclaim)
    return { view, discussion: { deferred: 'required-action', events: [] } };
  const identity = scope(view);
  const walk = !reset && state.discussionWalk?.scope === identity ? state.discussionWalk : null;
  const after = walk?.cursor ?? Math.max(0, view.history.streamHead - 10);
  const through = view.history.streamHead;

  if (after >= through)
    return {
      view,
      discussion: {
        events: [],
        cursor: after,
        through,
        hasMore: false,
        awaitingReply: pendingReplies(walk, view.serverNow),
      },
    };

  const page = await client.history(view.matchId, {
    epoch: view.history.visibilityEpoch,
    after,
    through,
    limit: 10,
    maxBytes: 12288,
  });

  const fresh = await remember(await client.observation(view.matchId));

  if (
    scope(fresh) !== identity ||
    page.reset ||
    page.matchId !== fresh.matchId ||
    page.visibilityEpoch !== fresh.history.visibilityEpoch
  )
    return { view: fresh, discussion: { reset: true, events: [] } };

  const applied = await change((latest) => {
    if (!latest.observation || scope(latest.observation) !== identity) return false;
    const previous = latest.discussionWalk?.scope === identity ? latest.discussionWalk.cursor : 0;
    const currentWalk = !reset && latest.discussionWalk?.scope === identity ? latest.discussionWalk : null;
    let awaitingReply = pendingReplies(currentWalk, fresh.serverNow);

    for (const event of page.events) {
      if (!reset && event.id <= previous) continue;

      if (event.type !== 'chat') continue;

      if (event.seat === fresh.you?.seat && event.data?.replyTo)
        awaitingReply = awaitingReply.filter((message) => message.eventKey !== event.data.replyTo.eventKey);
      else if (
        fresh.you &&
        event.seat !== fresh.you.seat &&
        ((event.data?.to ?? []).includes(fresh.you.seat) || event.data?.replyTo?.seat === fresh.you.seat)
      ) {
        awaitingReply = awaitingReply.filter((message) => message.eventKey !== event.eventKey);
        awaitingReply.push({
          eventKey: event.eventKey,
          seat: event.seat,
          at: event.at,
          text: [...event.text].slice(0, 400).join(''),
          truncated: [...event.text].length > 400,
        });
      }
    }

    latest.discussionWalk = {
      scope: identity,
      cursor: Math.max(previous, page.cursor),
      awaitingReply: pendingReplies({ awaitingReply }, fresh.serverNow),
    };
    Object.assign(state, latest);

    return true;
  });

  if (!applied) return { view: fresh, discussion: { reset: true, events: [] } };

  return {
    view: fresh,
    discussion: {
      visibilityEpoch: page.visibilityEpoch,
      cursor: page.cursor,
      through,
      hasMore: page.cursor < fresh.history.streamHead,
      omittedBefore: walk ? undefined : after,
      awaitingReply: state.discussionWalk.awaitingReply,
      events: page.events.map((event) => ({
        ...event,
        addressedToYou:
          event.type === 'chat' &&
          fresh.you != null &&
          ((event.data?.to ?? []).includes(fresh.you.seat) || event.data?.replyTo?.seat === fresh.you.seat),
      })),
    },
  };
}
