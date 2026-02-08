import { describe, expect, it } from "vitest";
import { generateKeyPairSync } from "node:crypto";
import {
  canonicalizePayload,
  signMatchReceipt,
  signTournamentReceipt,
  verifyReceipt,
  type MatchReceiptPayload,
  type TournamentReceiptPayload,
} from "../src/core/receipt.js";

function generateKeyPair() {
  return generateKeyPairSync("ed25519", {
    publicKeyEncoding: { format: "pem", type: "spki" },
    privateKeyEncoding: { format: "pem", type: "pkcs8" },
  });
}

describe("receipt signing", () => {
  it("signs and verifies match receipts", () => {
    const { privateKey } = generateKeyPair();
    const payload: MatchReceiptPayload = {
      matchId: "match-001",
      logHash: "sha256:aaaa",
      manifestHash: "sha256:bbbb",
      runnerVersion: "1.2.3",
      issuedBy: "unit-test",
    };

    const receipt = signMatchReceipt(payload, privateKey);
    expect(verifyReceipt(receipt)).toBe(true);

    const tampered = {
      ...receipt,
      payload: { ...receipt.payload, matchId: "match-002" },
    };
    expect(verifyReceipt(tampered)).toBe(false);

    const badSignature = {
      ...receipt,
      signature: `00${receipt.signature.slice(2)}`,
    };
    expect(verifyReceipt(badSignature)).toBe(false);
  });

  it("signs and verifies tournament receipts", () => {
    const { privateKey } = generateKeyPair();
    const payload: TournamentReceiptPayload = {
      tournamentId: "tour-001",
      truthBundleHash: "sha256:cccc",
      matchCount: 3,
      issuedBy: "unit-test",
    };

    const receipt = signTournamentReceipt(payload, privateKey);
    expect(verifyReceipt(receipt)).toBe(true);

    const tampered = {
      ...receipt,
      payload: { ...receipt.payload, matchCount: 4 },
    };
    expect(verifyReceipt(tampered)).toBe(false);
  });

  it("canonicalizes payloads with stable key ordering", () => {
    const payloadA = { b: 2, a: 1, nested: { d: 4, c: 3 } };
    const payloadB = { a: 1, nested: { c: 3, d: 4 }, b: 2 };

    const bytesA = canonicalizePayload(payloadA);
    const bytesB = canonicalizePayload(payloadB);
    expect(bytesA.equals(bytesB)).toBe(true);
  });

  it("does not include signedAt in signed bytes", () => {
    const { privateKey } = generateKeyPair();
    const payload: MatchReceiptPayload = {
      matchId: "match-002",
      logHash: "sha256:dddd",
      manifestHash: "sha256:eeee",
      runnerVersion: "1.2.3",
      issuedBy: "unit-test",
    };

    const receiptA = signMatchReceipt(payload, privateKey);
    const receiptB = signMatchReceipt(payload, privateKey);
    receiptA.signedAt = "2025-01-01T00:00:00Z";
    receiptB.signedAt = "2026-01-01T00:00:00Z";

    expect(receiptA.signature).toBe(receiptB.signature);
  });
});
