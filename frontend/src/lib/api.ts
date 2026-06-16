const API_BASE = "/api";

let currentWalletAddress: string | null = null;

export function setCurrentWalletAddress(address: string | null) {
  currentWalletAddress = address;
}

function getAuthHeaders(): Record<string, string> {
  if (!currentWalletAddress) return {};
  return {
    "X-Sui-Address": currentWalletAddress,
    "X-User-Email": currentWalletAddress,
  };
}

export class ApiError extends Error {
  status: number;
  code?: string;
  constructor(message: string, status: number, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
    this.name = "ApiError";
  }
}

const FRIENDLY_FALLBACK: Record<number, string> = {
  400: "That didn't quite work. Double-check the details and try again.",
  401: "You're not signed in. Sign in to continue.",
  403: "You don't have access to that.",
  404: "We couldn't find what you were looking for.",
  409: "That name is already taken. Try a different one.",
  413: "That file is too big.",
  429: "Slow down a bit — too many requests. Try again in a moment.",
  500: "Something broke on our end. Try again in a moment.",
  502: "Our server is having a moment. Try again shortly.",
  503: "We're doing some quick maintenance. Try again in a bit.",
};

function friendlyMessage(status: number, fallback?: string): string {
  if (fallback && fallback.length > 0 && fallback.length < 200) return fallback;
  return FRIENDLY_FALLBACK[status] || "Something went wrong. Please try again.";
}

async function parseError(res: Response): Promise<ApiError> {
  let body: { error?: string; code?: string } = {};
  try {
    const text = await res.text();
    if (text) body = JSON.parse(text);
  } catch {
    // non-JSON body; ignore
  }
  return new ApiError(friendlyMessage(res.status, body.error), res.status, body.code);
}

export async function apiGet<T>(path: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, { headers: getAuthHeaders() });
  } catch {
    throw new ApiError(
      "Can't reach Vela right now. Check your connection and try again.",
      0
    );
  }
  if (!res.ok) throw await parseError(res);
  return res.json();
}

export async function apiPost<T>(path: string, body: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...getAuthHeaders() },
      body: JSON.stringify(body),
    });
  } catch {
    throw new ApiError(
      "Can't reach Vela right now. Check your connection and try again.",
      0
    );
  }
  if (!res.ok) throw await parseError(res);
  return res.json();
}

export async function apiPatch<T>(path: string, body: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...getAuthHeaders() },
      body: JSON.stringify(body),
    });
  } catch {
    throw new ApiError(
      "Can't reach Vela right now. Check your connection and try again.",
      0
    );
  }
  if (!res.ok) throw await parseError(res);
  return res.json();
}
