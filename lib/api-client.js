// Client-side fetch wrapper for this app's API routes.
//
// Every API route in this app returns JSON — including errors. A non-JSON
// response therefore means the request never reached a route handler
// (auth middleware, a crashed dev server, a proxy error page). Parsing it
// with res.json() produces the cryptic `Unexpected token '<'` error, and a
// followed auth redirect can even 200 and make a failed write look
// successful. This wrapper turns all of those into typed errors so call
// sites can react uniformly.

export class ApiError extends Error {
  constructor(message, status, { nonJson = false } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.nonJson = nonJson;
  }
}

export class SessionExpiredError extends ApiError {
  constructor(status = 401) {
    super('Your session has expired. Please log back in.', status);
    this.name = 'SessionExpiredError';
  }
}

export async function apiFetch(url, options = {}) {
  const res = await fetch(url, options);

  if (res.status === 401) throw new SessionExpiredError();

  const contentType = res.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    // An OK-but-HTML response is an auth redirect that fetch followed to the
    // login page — the write did NOT happen even though the status is 200.
    if (res.ok || res.redirected) throw new SessionExpiredError(res.status);
    throw new ApiError(
      `The server returned an unexpected response (HTTP ${res.status}).`,
      res.status,
      { nonJson: true },
    );
  }

  const body = res.status === 204 ? null : await res.json();
  if (!res.ok) {
    throw new ApiError(body?.error || `Request failed (HTTP ${res.status})`, res.status);
  }
  return body;
}
