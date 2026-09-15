export class ApiError extends Error {
  constructor(status, code, message, details = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = Object.fromEntries(
      ['gameId', 'matchId', 'requiredProtocolVersion', 'rulesUrl', 'cliUrl', 'cliDownloadUrl'].flatMap(
        (key) => (details?.[key] === undefined ? [] : [[key, details[key]]]),
      ),
    );
  }
}

// Dependency-free JSON boundary: error text must be a primitive before constructing an Error.
// eslint-disable-next-line anti-slop/no-runtime-typeof
const errorText = (value, fallback) => (typeof value === 'string' ? value : fallback);

/** HTTP denial remains authoritative even when its body is absent, malformed or a JSON primitive. */
export async function apiResponse(response) {
  let data;

  try {
    data = await response.json();
  } catch (error) {
    if (response.ok) throw error;
  }

  if (!response.ok) {
    const problem = data?.error;
    throw new ApiError(
      response.status,
      errorText(problem?.code, 'http-error'),
      errorText(problem?.message, `Request failed (HTTP ${response.status}).`),
      problem,
    );
  }

  return data;
}
