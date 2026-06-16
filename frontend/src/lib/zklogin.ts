/**
 * Sui zkLogin authentication utilities.
 *
 * Flow:
 *  1. initZkLogin()        — generate ephemeral keypair + randomness, build
 *                            Google OAuth URL, store session data.
 *  2. Google redirects back to /auth/callback with #id_token=<jwt>
 *  3. completeZkLogin(jwt) — call Mysten prover → get ZK proof, derive Sui
 *                            address, persist in sessionStorage.
 *  4. getZkLoginSession()  — read persisted session (address + proof).
 *  5. clearZkLogin()       — sign out.
 */

import {
  generateNonce,
  generateRandomness,
  getExtendedEphemeralPublicKey,
  jwtToAddress,
} from "@mysten/sui/zklogin";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { SuiGrpcClient } from "@mysten/sui/grpc";

// ---------------------------------------------------------------------------
// Config — VITE_GOOGLE_CLIENT_ID and VITE_SUI_NETWORK injected at build time.
// ---------------------------------------------------------------------------

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string;
const SUI_NETWORK = (import.meta.env.VITE_SUI_NETWORK ?? "testnet") as
  | "mainnet"
  | "testnet"
  | "devnet";

const PROVER_URL = "https://prover-dev.mystenlabs.com/v1";
const SESSION_KEY = "vela_zklogin";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ZkLoginSession {
  address: string;      // Sui address (0x…)
  email: string;        // from Google JWT
  username?: string;    // set after onboarding
  sub: string;          // Google subject claim
  proof: object;        // ZK proof from Mysten prover
  ephemeralPrivKey: string;
  maxEpoch: number;
  randomness: string;
  salt: string;
}

// ---------------------------------------------------------------------------
// Sui client (shared singleton)
// ---------------------------------------------------------------------------

const SUI_RPC_URLS = {
  mainnet: "https://fullnode.mainnet.sui.io:443",
  testnet: "https://fullnode.testnet.sui.io:443",
  devnet: "https://fullnode.devnet.sui.io:443",
} as const;

export const suiClient = new SuiGrpcClient({
  network: SUI_NETWORK,
  baseUrl: SUI_RPC_URLS[SUI_NETWORK],
});

// ---------------------------------------------------------------------------
// Step 1: initZkLogin
//   - Gets current epoch from Sui
//   - Generates ephemeral keypair + randomness
//   - Computes nonce
//   - Stores partial session in sessionStorage
//   - Returns Google OAuth redirect URL
// ---------------------------------------------------------------------------

export async function initZkLogin(): Promise<string> {
  if (!GOOGLE_CLIENT_ID) {
    throw new Error(
      "Sign-in is unavailable right now. The Google client isn't configured."
    );
  }

  // Current epoch — session is valid for this epoch + MAX_EPOCH_EXTENSION epochs.
  const { systemState } = await suiClient.core.getCurrentSystemState();
  const maxEpoch = Number(systemState.epoch) + 2; // valid for ~2 epochs (~2 days on testnet)

  // Ephemeral keypair (lives only for this login session).
  const ephemeralKeyPair = new Ed25519Keypair();
  const randomness = generateRandomness();

  const nonce = generateNonce(
    ephemeralKeyPair.getPublicKey(),
    maxEpoch,
    randomness
  );

  // Persist partial session — completed in completeZkLogin().
  const partial = {
    ephemeralPrivKey: ephemeralKeyPair.getSecretKey(),
    maxEpoch,
    randomness,
  };
  sessionStorage.setItem(`${SESSION_KEY}_partial`, JSON.stringify(partial));

  const redirectUri = `${window.location.origin}/auth/callback`;

  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: "id_token",
    scope: "openid email profile",
    nonce,
  });

  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

// ---------------------------------------------------------------------------
// Step 3: completeZkLogin
//   - Called from /auth/callback with the JWT from Google
//   - Sends JWT + ephemeral key data to Mysten prover
//   - Derives Sui address
//   - Stores full session in sessionStorage
// ---------------------------------------------------------------------------

export async function completeZkLogin(jwt: string): Promise<ZkLoginSession> {
  const partialRaw = sessionStorage.getItem(`${SESSION_KEY}_partial`);
  if (!partialRaw) {
    throw new Error(
      "Your sign-in session expired. Please try signing in again."
    );
  }

  const { ephemeralPrivKey, maxEpoch, randomness } = JSON.parse(partialRaw) as {
    ephemeralPrivKey: string;
    maxEpoch: number;
    randomness: string;
  };

  const ephemeralKeyPair = Ed25519Keypair.fromSecretKey(ephemeralPrivKey);
  const extendedEphemeralPublicKey = getExtendedEphemeralPublicKey(
    ephemeralKeyPair.getPublicKey()
  );

  // Decode JWT claims (header.payload.sig — payload is base64url).
  const [, payloadB64] = jwt.split(".");
  const payload = JSON.parse(atob(payloadB64.replace(/-/g, "+").replace(/_/g, "/")));
  const email: string = payload.email ?? "";
  const sub: string = payload.sub ?? "";

  // Salt: derive deterministically from the sub claim so the same Google
  // account always gets the same Sui address.  For a hackathon this is fine;
  // production should store the salt server-side.
  const saltBigInt = BigInt(
    "0x" +
      Array.from(new TextEncoder().encode(sub))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("")
  ) % BigInt("340282366920938463463374607431768211456"); // 2^128
  const salt = saltBigInt.toString();

  // Call Mysten's ZK prover.
  const proverRes = await fetch(PROVER_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jwt,
      extendedEphemeralPublicKey,
      maxEpoch,
      jwtRandomness: randomness,
      salt,
      keyClaimName: "sub",
    }),
  });

  if (!proverRes.ok) {
    throw new Error(
      "Sign-in is taking longer than usual. Please try again in a moment."
    );
  }

  const proof = await proverRes.json();

  // Derive the Sui address (legacyAddress=false uses the current zkLogin address derivation).
  const address = jwtToAddress(jwt, salt, false);

  const session: ZkLoginSession = {
    address,
    email,
    sub,
    proof,
    ephemeralPrivKey,
    maxEpoch,
    randomness,
    salt,
  };

  sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
  sessionStorage.removeItem(`${SESSION_KEY}_partial`);

  return session;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function getZkLoginSession(): ZkLoginSession | null {
  const raw = sessionStorage.getItem(SESSION_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as ZkLoginSession;
  } catch {
    return null;
  }
}

export function clearZkLogin(): void {
  sessionStorage.removeItem(SESSION_KEY);
  sessionStorage.removeItem(`${SESSION_KEY}_partial`);
}
