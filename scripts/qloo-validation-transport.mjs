const ORIGIN = "https://hackathon.api.qloo.com";
const PATHS = new Set(["/v2/tags", "/v2/insights", "/entities"]);

// Each SDK retry passes through this boundary. No URLs, headers, or bodies are
// retained. Persist the reservation before fetch, so reruns share the same cap.
export function createValidationTransport({ fetchImpl, initial = {}, persist, cap = 5 }) {
  const prior = initial.outboundAttempts ?? 0;
  const priorCap = initial.cap ?? 5;
  if (!Number.isSafeInteger(prior) || prior < 0 ||
      !Number.isInteger(cap) || cap < 1 || cap > 5 ||
      !Number.isInteger(priorCap) || priorCap < 1 || priorCap > 5)
    throw new Error("INVALID_VALIDATION_STATE");
  const state = {
    cap: Math.min(cap, priorCap),
    outboundAttempts: prior,
    blockedAttempts: initial.blockedAttempts ?? 0,
    stopReason: initial.stopReason ?? null,
    attempts: [...(initial.attempts ?? [])],
  };
  const abort = new AbortController();
  const snapshot = () => structuredClone(state);
  const save = () => persist(snapshot());
  function stop(reason) {
    state.stopReason ||= reason;
    abort.abort(new Error("VALIDATION_STOPPED"));
    save();
  }
  async function fetchBounded(input, init = {}) {
    let url;
    try {
      url = new URL(input instanceof Request ? input.url : String(input));
    } catch {
      stop("UNEXPECTED_DESTINATION");
      throw new Error("VALIDATION_STOPPED");
    }
    if (
      url.origin !== ORIGIN || url.username || url.password || url.hash ||
      !PATHS.has(url.pathname) || (init.method ?? (input instanceof Request ? input.method : "GET")) !== "GET" ||
      [...url.searchParams.keys()].some((key) => /^(?:api[_-]?key|key|token|authorization)$/i.test(key))
    ) {
      stop("UNEXPECTED_DESTINATION");
      throw new Error("VALIDATION_STOPPED");
    }
    if (state.stopReason || state.outboundAttempts >= state.cap) {
      state.blockedAttempts += 1;
      state.stopReason ||= state.cap === 5 ? "FIVE_REQUEST_CAP" : "REQUEST_CAP";
      save();
      throw new Error("VALIDATION_STOPPED");
    }
    const attempt = { number: ++state.outboundAttempts, endpoint: url.pathname, status: null };
    state.attempts.push(attempt);
    save();
    try {
      const response = await fetchImpl(input, {
        ...init,
        redirect: "error",
        signal: AbortSignal.any([
          abort.signal,
          AbortSignal.timeout(15000),
          ...(init.signal ? [init.signal] : []),
        ]),
      });
      attempt.status = response.status;
      if (!response.ok) stop("HTTP_" + response.status);
      else save();
      return response;
    } catch {
      stop("TRANSPORT_FAILURE");
      throw new Error("VALIDATION_STOPPED");
    }
  }
  return { fetch: fetchBounded, snapshot };
}
