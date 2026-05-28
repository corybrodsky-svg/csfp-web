import { sanitizePublicErrorMessage } from "./safeErrorMessage";

export type SafeJsonResponseResult<T> = {
  ok: boolean;
  status: number;
  body: T | null;
  error: string;
  message: string;
  source: string;
  contentType: string;
};

function asText(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function looksLikeHtml(value: string) {
  const text = value.trim().slice(0, 250).toLowerCase();
  return (
    text.startsWith("<!doctype") ||
    text.startsWith("<html") ||
    text.includes("<html") ||
    text.includes("cf-error-details") ||
    text.includes("web server is returning an unknown error")
  );
}

function getBodyError(body: unknown) {
  if (!body || typeof body !== "object") return "";
  const record = body as Record<string, unknown>;
  return asText(record.message) || asText(record.error) || asText(record.warning) || "";
}

export async function readSafeJsonResponse<T>(
  response: Response,
  source: string,
  fallbackMessage = "The request could not be completed."
): Promise<SafeJsonResponseResult<T>> {
  const contentType = asText(response.headers.get("content-type")).toLowerCase();

  if (!contentType.includes("application/json")) {
    const text = await response.text().catch(() => "");
    const htmlLike = looksLikeHtml(text) || contentType.includes("text/html");
    const message = htmlLike
      ? "The server returned an HTML error page instead of JSON."
      : sanitizePublicErrorMessage(text, fallbackMessage);
    return {
      ok: false,
      status: response.status,
      body: null,
      error: htmlLike ? "upstream_html_error" : "non_json_response",
      message,
      source,
      contentType,
    };
  }

  const body = (await response.json().catch(() => null)) as T | null;
  if (!body || typeof body !== "object") {
    return {
      ok: false,
      status: response.status,
      body,
      error: "invalid_json_response",
      message: "The server returned invalid JSON.",
      source,
      contentType,
    };
  }

  const rawError = getBodyError(body);
  const bodyOk = (body as Record<string, unknown>).ok;
  const ok = response.ok && bodyOk !== false;
  const error = ok ? "" : asText((body as Record<string, unknown>).error) || `http_${response.status}`;
  const message = ok ? "" : sanitizePublicErrorMessage(rawError, fallbackMessage);

  return {
    ok,
    status: response.status,
    body,
    error,
    message,
    source,
    contentType,
  };
}

export function formatSafeJsonDiagnostic(result: Pick<SafeJsonResponseResult<unknown>, "source" | "status" | "error" | "message">) {
  return [
    result.source,
    result.status ? `HTTP ${result.status}` : "network",
    result.error ? `code ${result.error}` : "",
    result.message,
  ].filter(Boolean).join(" · ");
}
