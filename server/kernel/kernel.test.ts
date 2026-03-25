import { describe, it, expect } from "vitest";
import crypto from "crypto";
import { db } from "../db";
import { domainEvents, featureFlags, deadLetterQueue, signedActionReceipts } from "@shared/schema";
import { eq } from "drizzle-orm";

describe("Secure Kernel", () => {
  describe("emitDomainEvent", () => {
    it("should insert a row into domain_events and return the id", async () => {
      const { emitDomainEvent } = await import("./index");
      const id = await emitDomainEvent("test-user", "test.event", { key: "value" }, "test-aggregate", "agg-1");
      expect(id).toBeGreaterThan(0);

      const [row] = await db
        .select()
        .from(domainEvents)
        .where(eq(domainEvents.id, id))
        .limit(1);
      expect(row).toBeDefined();
      expect(row.eventType).toBe("test.event");
      expect(row.userId).toBe("test-user");
    });
  });

  describe("issueSignedReceipt + HMAC verification", () => {
    it("should create a receipt whose HMAC validates via verifyReceipt", async () => {
      const { issueSignedReceipt, verifyReceipt } = await import("./index");
      const execKey = `test-exec-key-${Date.now()}`;
      const inputPayload = { input: 1 };
      const outputResult = { output: 2 };

      const receiptId = await issueSignedReceipt(
        "test-user",
        "test.action",
        execKey,
        inputPayload,
        outputResult,
      );
      expect(receiptId).toBeGreaterThan(0);

      const [receipt] = await db
        .select()
        .from(signedActionReceipts)
        .where(eq(signedActionReceipts.id, receiptId))
        .limit(1);
      expect(receipt).toBeDefined();
      expect(receipt.hmacSignature).toBeTruthy();
      expect(receipt.hmacSignature!.length).toBe(64);

      const isValid = verifyReceipt({
        userId: receipt.userId!,
        actionType: receipt.actionType!,
        executionKey: receipt.executionKey!,
        payload: receipt.payload as Record<string, any>,
        result: receipt.result as Record<string, any>,
        hmacSignature: receipt.hmacSignature!,
      });
      expect(isValid).toBe(true);

      const isTampered = verifyReceipt({
        userId: receipt.userId!,
        actionType: receipt.actionType!,
        executionKey: receipt.executionKey!,
        payload: { tampered: true },
        result: receipt.result as Record<string, any>,
        hmacSignature: receipt.hmacSignature!,
      });
      expect(isTampered).toBe(false);
    });
  });

  describe("checkFeatureFlag", () => {
    it("should return false for a disabled flag", async () => {
      const { checkFeatureFlag } = await import("./index");
      const flagKey = `test-disabled-flag-${Date.now()}`;

      await db.insert(featureFlags).values({
        flagKey,
        flagName: "Test Disabled Flag",
        description: "A disabled flag for testing",
        enabled: false,
        rolloutPercentage: 100,
      });

      const result = await checkFeatureFlag(flagKey, "test-user");
      expect(result).toBe(false);
    });
  });

  describe("routeToDLQ", () => {
    it("should insert a row into dead_letter_queue and return the id", async () => {
      const { routeToDLQ } = await import("./index");
      const id = await routeToDLQ("test.job", { data: "payload" }, "test error message", "test-user");
      expect(id).toBeGreaterThan(0);

      const [row] = await db
        .select()
        .from(deadLetterQueue)
        .where(eq(deadLetterQueue.id, id))
        .limit(1);
      expect(row).toBeDefined();
      expect(row.jobType).toBe("test.job");
      expect(row.error).toBe("test error message");
      expect(row.userId).toBe("test-user");
      expect(row.status).toBe("pending");
    });
  });
});
