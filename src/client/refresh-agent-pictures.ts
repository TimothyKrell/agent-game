import { isCancelledError, type QueryClient } from '@tanstack/react-query';
import { agentPictureOptions, type AgentPictureMap } from './agent-picture-data';

/** Observe the request's promise, not QueryObserver's mutable result or Query.fetch's reverted data. */
export async function refreshAgentPictures(
  client: QueryClient,
  ids: readonly string[],
  lifetime: AbortSignal,
): Promise<AgentPictureMap> {
  lifetime.throwIfAborted();
  const options = client.defaultQueryOptions(agentPictureOptions(ids));
  const query = client.getQueryCache().build(client, options);
  // fetch starts/joins the request synchronously. Query still owns transport cancellation and data
  // publication; its fetch wrapper can resolve reverted data, so only consume the raw request below.
  void query.fetch(options, { cancelRefetch: false }).catch(() => {});
  const request = query.promise;

  if (!request) throw new Error('The picture refresh did not start.');

  return new Promise<AgentPictureMap>((resolve, reject) => {
    const retired = () => reject(lifetime.reason);
    lifetime.addEventListener('abort', retired, { once: true });

    if (lifetime.aborted) retired();

    request.then(
      (pictures) => {
        lifetime.removeEventListener('abort', retired);

        if (lifetime.aborted) reject(lifetime.reason);
        else resolve(pictures);
      },
      (cause) => {
        lifetime.removeEventListener('abort', retired);
        reject(
          isCancelledError(cause)
            ? new DOMException('The picture refresh was cancelled.', 'AbortError')
            : cause,
        );
      },
    );
  });
}
