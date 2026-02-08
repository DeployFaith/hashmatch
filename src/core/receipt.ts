import { createPublicKey, sign, verify } from "node:crypto";
import { stableStringify } from "./json.js";

export interface MatchReceiptPayload {
  matchId: string;
  logHash: string;
  manifestHash: string;
  runnerVersion: string;
  issuedBy: string;
}

export interface TournamentReceiptPayload {
  tournamentId: string;
  truthBundleHash: string;
  matchCount: number;
  issuedBy: string;
}

export interface Receipt<T> {
  version: 1;
  algorithm: "ed25519";
  payload: T;
  signature: string;
  publicKey: string;
  signedAt?: string;
}

export function canonicalizePayload<T>(payload: T): Buffer {
  const serialized = stableStringify(payload);
  return Buffer.from(serialized, "utf-8");
}

function signReceipt<T>(payload: T, privateKeyPem: string): Receipt<T> {
  const bytes = canonicalizePayload(payload);
  const signature = sign(null, bytes, privateKeyPem);
  const publicKeyDer = createPublicKey(privateKeyPem).export({
    format: "der",
    type: "spki",
  }) as Buffer;

  return {
    version: 1,
    algorithm: "ed25519",
    payload,
    signature: signature.toString("hex"),
    publicKey: publicKeyDer.toString("hex"),
  };
}

export function signMatchReceipt(
  payload: MatchReceiptPayload,
  privateKeyPem: string,
): Receipt<MatchReceiptPayload> {
  return signReceipt(payload, privateKeyPem);
}

export function signTournamentReceipt(
  payload: TournamentReceiptPayload,
  privateKeyPem: string,
): Receipt<TournamentReceiptPayload> {
  return signReceipt(payload, privateKeyPem);
}

export function verifyReceipt<T>(receipt: Receipt<T>): boolean {
  try {
    if (receipt.version !== 1 || receipt.algorithm !== "ed25519") {
      return false;
    }
    const bytes = canonicalizePayload(receipt.payload);
    const signature = Buffer.from(receipt.signature, "hex");
    const publicKeyDer = Buffer.from(receipt.publicKey, "hex");
    return verify(
      null,
      bytes,
      {
        key: publicKeyDer,
        format: "der",
        type: "spki",
      },
      signature,
    );
  } catch {
    return false;
  }
}
