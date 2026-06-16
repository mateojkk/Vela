import { useCallback, useEffect, useMemo, useState } from "react";
import {
  useCurrentAccount,
  useSignAndExecuteTransaction,
  useSignPersonalMessage,
  useSuiClient,
} from "@mysten/dapp-kit";
import { MemWal } from "@mysten-incubation/memwal";
import { addDelegateKey, generateDelegateKey } from "@mysten-incubation/memwal/account";
import type { Transaction } from "@mysten/sui/transactions";

const SERVER_URL = import.meta.env.VITE_MEMWAL_SERVER_URL;
const ACCOUNT_ID = import.meta.env.VITE_MEMWAL_ACCOUNT_ID;
const PACKAGE_ID = import.meta.env.VITE_MEMWAL_PACKAGE_ID;

interface StoredDelegate {
  privateKey: string;
  publicKey: string;
  suiAddress: string;
}

function delegateKey(address: string) {
  return `vela_memwal_delegate_${address}`;
}

function authorizedKey(address: string) {
  return `vela_memwal_authorized_${address}`;
}

function loadDelegate(address: string): StoredDelegate | null {
  const raw = localStorage.getItem(delegateKey(address));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as StoredDelegate;
  } catch {
    return null;
  }
}

function saveDelegate(address: string, delegate: StoredDelegate) {
  localStorage.setItem(delegateKey(address), JSON.stringify(delegate));
}

function isMarkedAuthorized(address: string): boolean {
  return localStorage.getItem(authorizedKey(address)) === "true";
}

function markAuthorized(address: string, value: boolean) {
  if (value) {
    localStorage.setItem(authorizedKey(address), "true");
  } else {
    localStorage.removeItem(authorizedKey(address));
  }
}

async function getOrCreateDelegate(address: string): Promise<StoredDelegate> {
  const existing = loadDelegate(address);
  if (existing) return existing;
  const delegate = await generateDelegateKey();
  const stored: StoredDelegate = {
    privateKey: delegate.privateKey,
    publicKey: bytesToHex(delegate.publicKey),
    suiAddress: delegate.suiAddress,
  };
  saveDelegate(address, stored);
  return stored;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function isAuthError(err: unknown): boolean {
  const msg = String(err).toLowerCase();
  return (
    msg.includes("unauthorized") ||
    msg.includes("delegate") ||
    msg.includes("permission") ||
    msg.includes("not authorized") ||
    msg.includes("invalid signature")
  );
}

export interface UseMemWalResult {
  memwal: MemWal | null;
  delegateAddress: string | null;
  authorized: boolean | null;
  loading: boolean;
  error: string | null;
  authorize: () => Promise<void>;
  remember: (text: string) => Promise<unknown>;
  recall: (
    query: string,
    options?: { limit?: number; maxDistance?: number }
  ) => Promise<{ results: Array<{ text: string; distance: number; blob_id: string }>; total: number }>;
  clearError: () => void;
}

export function useMemWal(): UseMemWalResult {
  const account = useCurrentAccount();
  const address = account?.address;
  const suiClient = useSuiClient();
  const { mutateAsync: signAndExecuteTransaction } = useSignAndExecuteTransaction();
  const { mutateAsync: signPersonalMessage } = useSignPersonalMessage();

  const [delegate, setDelegate] = useState<StoredDelegate | null>(null);
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!address) return;
    let cancelled = false;
    getOrCreateDelegate(address).then((d) => {
      if (cancelled) return;
      setDelegate(d);
      setAuthorized(isMarkedAuthorized(address) ? true : null);
    });
    return () => {
      cancelled = true;
    };
  }, [address]);

  const memwal = useMemo(() => {
    if (!delegate || !ACCOUNT_ID || !SERVER_URL) return null;
    return MemWal.create({
      key: delegate.privateKey,
      accountId: ACCOUNT_ID,
      serverUrl: SERVER_URL,
      namespace: address ?? "default",
    });
  }, [delegate, address]);

  const authorize = useCallback(async () => {
    if (!address || !delegate || !ACCOUNT_ID || !PACKAGE_ID || !suiClient) {
      setError("Wallet not connected or MemWal is not configured");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const pkBytes = hexToBytes(delegate.publicKey);
      const walletSigner = {
        address,
        signAndExecuteTransaction: async ({
          transaction,
        }: {
          transaction: Transaction;
        }) => {
          return signAndExecuteTransaction({ transaction });
        },
        signPersonalMessage: async ({ message }: { message: Uint8Array }) => {
          return signPersonalMessage({ message });
        },
      };
      await addDelegateKey({
        packageId: PACKAGE_ID,
        accountId: ACCOUNT_ID,
        publicKey: pkBytes,
        label: `Vela ${address.slice(0, 8)}`,
        walletSigner,
        suiClient,
      });
      setAuthorized(true);
      if (address) markAuthorized(address, true);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [address, delegate, suiClient, signAndExecuteTransaction, signPersonalMessage]);

  const remember = useCallback(
    async (text: string) => {
      if (!memwal) throw new Error("MemWal not ready");
      try {
        const result = await memwal.remember(text);
        if (address) markAuthorized(address, true);
        setAuthorized(true);
        return result;
      } catch (err) {
        if (isAuthError(err) && address) {
          markAuthorized(address, false);
          setAuthorized(false);
        }
        throw err;
      }
    },
    [memwal, address]
  );

  const recall = useCallback(
    async (query: string, options?: { limit?: number; maxDistance?: number }) => {
      if (!memwal) throw new Error("MemWal not ready");
      try {
        const result = await memwal.recall(query, options);
        if (address) markAuthorized(address, true);
        setAuthorized(true);
        return result as {
          results: Array<{ text: string; distance: number; blob_id: string }>;
          total: number;
        };
      } catch (err) {
        if (isAuthError(err) && address) {
          markAuthorized(address, false);
          setAuthorized(false);
        }
        throw err;
      }
    },
    [memwal, address]
  );

  const clearError = useCallback(() => setError(null), []);

  return {
    memwal,
    delegateAddress: delegate?.suiAddress ?? null,
    authorized,
    loading,
    error,
    authorize,
    remember,
    recall,
    clearError,
  };
}

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < clean.length; i += 2) {
    bytes[i / 2] = parseInt(clean.slice(i, i + 2), 16);
  }
  return bytes;
}
