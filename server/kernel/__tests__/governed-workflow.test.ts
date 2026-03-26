import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import crypto from "crypto";
import { db } from "../../db";
import {
  signedActionReceipts,
  approvalDecisions,
  approvalMatrixRules,
  deadLetterQueue,
  webhookDeliveryRecords,
  schemaRegistry,
} from "@shared/schema";
import { eq, and, desc } from "drizzle-orm";
import {
  routeCommand,
  registerCommand,
  routeToDLQ,
} from "../index";

async function cleanupTestData(userId: string) {
  await db.delete(signedActionReceipts).where(eq(signedActionReceipts.userId, userId)).catch(() => {});
  await db.delete(approvalDecisions).where(eq(approvalDecisions.userId, userId)).catch(() => {});
}

describe("Governed Workflow: Smart Edit through Kernel", () => {
  const TEST_USER = "test-governed-user-" + Date.now();

  beforeAll(async () => {
    await db.insert(approvalMatrixRules).values({
      actionClass: "test-smart-edit",
      bandClass: "GREEN",
      defaultState: "auto-approved",
      approver: "system",
      reversible: false,
      rollbackAvailable: false,
      expertHandoff: false,
      confidenceThreshold: 0.6,
      description: "Test smart-edit rule for governed workflow tests",
    }).onConflictDoNothing();

    await db.insert(approvalMatrixRules).values({
      actionClass: "test-red-action",
      bandClass: "RED",
      defaultState: "requires-approval",
      approver: "user",
      reversible: true,
      rollbackAvailable: true,
      expertHandoff: true,
      description: "Test RED band rule",
    }).onConflictDoNothing();

    await db.insert(approvalMatrixRules).values({
      actionClass: "test-yellow-action",
      bandClass: "YELLOW",
      defaultState: "confidence-gated",
      approver: "system",
      confidenceThreshold: 0.8,
      description: "Test YELLOW band rule",
    }).onConflictDoNothing();

    registerCommand("test-smart-edit", async (payload) => {
      return {
        status: "completed",
        videoId: payload.videoId,
        highlightSegments: 5,
      };
    });

    registerCommand("test-red-action", async () => ({ changed: true }));
    registerCommand("test-yellow-action", async () => ({ published: true }));
    registerCommand("test-failing-action", async () => {
      throw new Error("Simulated processing failure");
    });

    await db.insert(approvalMatrixRules).values({
      actionClass: "test-failing-action",
      bandClass: "GREEN",
      defaultState: "auto-approved",
      approver: "system",
      reversible: false,
      rollbackAvailable: false,
      expertHandoff: false,
      description: "Test rule for failing action DLQ test",
    }).onConflictDoNothing();
  });

  beforeEach(async () => {
    await cleanupTestData(TEST_USER);
  });

  it("should run through kernel with GREEN auto-approval and produce a signed receipt", async () => {
    const executionKey = `test-smart-edit:${TEST_USER}:42:${Date.now()}`;

    const result = await routeCommand("test-smart-edit", {
      userId: TEST_USER,
      videoId: 42,
      queueItemId: 1,
      executionKey,
    }, {
      confidence: 0.85,
      decisionTheater: {
        whatChanged: "smart-edit-highlight-reel",
        whyChanged: "automated-video-editing",
      },
    });

    expect(result.success).toBe(true);
    expect(result.receiptId).toBeDefined();
    expect(result.result?.status).toBe("completed");

    const [receipt] = await db.select().from(signedActionReceipts)
      .where(eq(signedActionReceipts.executionKey, executionKey)).limit(1);
    expect(receipt).toBeDefined();
    expect(receipt.actionType).toBe("test-smart-edit");
    expect(receipt.hmacSignature).toBeTruthy();
    expect(receipt.status).toBe("completed");

    const [decision] = await db.select().from(approvalDecisions)
      .where(and(
        eq(approvalDecisions.userId, TEST_USER),
        eq(approvalDecisions.actionClass, "test-smart-edit")
      )).orderBy(desc(approvalDecisions.decidedAt)).limit(1);
    expect(decision).toBeDefined();
    expect(decision.decision).toBe("approved");
  });

  it("should deny execution when RED band rule exists", async () => {
    const executionKey = `test-red-action:${TEST_USER}:${Date.now()}`;

    const result = await routeCommand("test-red-action", {
      userId: TEST_USER,
      executionKey,
    }, { confidence: 0.99 });

    expect(result.success).toBe(false);
    expect(result.reason).toContain("RED band");

    const receipts = await db.select().from(signedActionReceipts)
      .where(eq(signedActionReceipts.executionKey, executionKey));
    expect(receipts.length).toBe(0);

    const [decision] = await db.select().from(approvalDecisions)
      .where(and(
        eq(approvalDecisions.userId, TEST_USER),
        eq(approvalDecisions.actionClass, "test-red-action")
      )).orderBy(desc(approvalDecisions.decidedAt)).limit(1);
    expect(decision).toBeDefined();
    expect(decision.decision).toBe("pending_human");
  });

  it("should reject duplicate execution keys (idempotency)", async () => {
    const executionKey = `test-smart-edit:${TEST_USER}:idempotent:${Date.now()}`;

    const result1 = await routeCommand("test-smart-edit", {
      userId: TEST_USER,
      videoId: 42,
      executionKey,
    }, { confidence: 0.9 });

    expect(result1.success).toBe(true);
    expect(result1.receiptId).toBeDefined();

    const result2 = await routeCommand("test-smart-edit", {
      userId: TEST_USER,
      videoId: 42,
      executionKey,
    }, { confidence: 0.9 });

    expect(result2.success).toBe(true);
    expect(result2.reason).toBe("idempotent-skip");
    expect(result2.existingReceiptId).toBeDefined();
  });

  it("should route handler failures to DLQ", async () => {
    const executionKey = `test-failing-action:${TEST_USER}:${Date.now()}`;

    const result = await routeCommand("test-failing-action", {
      userId: TEST_USER,
      executionKey,
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("Simulated processing failure");

    const dlqItems = await db.select().from(deadLetterQueue)
      .where(eq(deadLetterQueue.jobType, "test-failing-action"))
      .orderBy(desc(deadLetterQueue.createdAt))
      .limit(1);
    expect(dlqItems.length).toBeGreaterThanOrEqual(1);
    expect(dlqItems[0].error).toContain("Simulated processing failure");
  });

  it("should deny YELLOW band when confidence is below threshold", async () => {
    const executionKey = `test-yellow-action:${TEST_USER}:${Date.now()}`;

    const result = await routeCommand("test-yellow-action", {
      userId: TEST_USER,
      executionKey,
    }, { confidence: 0.5 });

    expect(result.success).toBe(false);
    expect(result.reason).toContain("YELLOW band");

    const receipts = await db.select().from(signedActionReceipts)
      .where(eq(signedActionReceipts.executionKey, executionKey));
    expect(receipts.length).toBe(0);
  });
});

describe("Webhook Verification Middleware", () => {
  it("should reject webhooks with bad signatures and write to DLQ", async () => {
    const { createWebhookVerificationMiddleware } = await import("../webhook-verification");

    process.env.STRIPE_WEBHOOK_SECRET = "whsec_test_secret_123";

    const middleware = createWebhookVerificationMiddleware("stripe");

    const req = {
      body: JSON.stringify({ type: "checkout.session.completed", id: "evt_test_bad" }),
      headers: { "stripe-signature": "t=1234567890,v1=invalid_signature_hex" },
      ip: "127.0.0.1",
      socket: { remoteAddress: "127.0.0.1" },
    } as any;

    let statusCode: number | undefined;
    let responseBody: any;
    const res = {
      status: (code: number) => {
        statusCode = code;
        return { json: (body: any) => { responseBody = body; } };
      },
    } as any;

    const next = () => {};

    await middleware(req, res, next);

    expect(statusCode).toBe(401);
    expect(responseBody?.error).toContain("Invalid webhook signature");

    const records = await db.select().from(webhookDeliveryRecords)
      .where(eq(webhookDeliveryRecords.source, "stripe"))
      .orderBy(desc(webhookDeliveryRecords.createdAt))
      .limit(1);
    expect(records.length).toBeGreaterThanOrEqual(1);
    expect(records[0].signatureValid).toBe(false);
    expect(records[0].status).toBe("rejected");

    delete process.env.STRIPE_WEBHOOK_SECRET;
  });

  it("should accept webhooks with valid Stripe signatures", async () => {
    const { createWebhookVerificationMiddleware } = await import("../webhook-verification");

    const secret = "whsec_test_valid_" + Date.now();
    process.env.STRIPE_WEBHOOK_SECRET = secret;

    const payload = JSON.stringify({ type: "invoice.paid", id: "evt_valid_" + Date.now() });
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const signedPayload = `${timestamp}.${payload}`;
    const sig = crypto.createHmac("sha256", secret).update(signedPayload).digest("hex");
    const stripeSignature = `t=${timestamp},v1=${sig}`;

    const middleware = createWebhookVerificationMiddleware("stripe");

    const req = {
      body: payload,
      headers: { "stripe-signature": stripeSignature },
      ip: "127.0.0.1",
      socket: { remoteAddress: "127.0.0.1" },
    } as any;

    let nextCalled = false;
    const res = {
      status: () => ({ json: () => {} }),
    } as any;

    await middleware(req, res, () => { nextCalled = true; });

    expect(nextCalled).toBe(true);

    const records = await db.select().from(webhookDeliveryRecords)
      .where(eq(webhookDeliveryRecords.source, "stripe"))
      .orderBy(desc(webhookDeliveryRecords.createdAt))
      .limit(1);
    expect(records.length).toBeGreaterThanOrEqual(1);
    expect(records[0].signatureValid).toBe(true);
    expect(records[0].status).toBe("verified");

    delete process.env.STRIPE_WEBHOOK_SECRET;
  });

  it("should reject webhooks with missing signature and route to DLQ", async () => {
    const { createWebhookVerificationMiddleware } = await import("../webhook-verification");

    process.env.YOUTUBE_WEBHOOK_SECRET = "yt_secret_test_" + Date.now();

    const middleware = createWebhookVerificationMiddleware("youtube");

    const req = {
      body: "<feed>test</feed>",
      headers: {},
      ip: "10.0.0.1",
      socket: { remoteAddress: "10.0.0.1" },
    } as any;

    let statusCode: number | undefined;
    let responseBody: any;
    const res = {
      status: (code: number) => {
        statusCode = code;
        return { json: (body: any) => { responseBody = body; } };
      },
    } as any;

    await middleware(req, res, () => {});

    expect(statusCode).toBe(401);
    expect(responseBody?.error).toContain("Missing webhook signature");

    const dlqItems = await db.select().from(deadLetterQueue)
      .where(eq(deadLetterQueue.jobType, "webhook-youtube"))
      .orderBy(desc(deadLetterQueue.createdAt))
      .limit(1);
    expect(dlqItems.length).toBeGreaterThanOrEqual(1);

    delete process.env.YOUTUBE_WEBHOOK_SECRET;
  });
});

describe("RED-Band Approval Lifecycle (DB-backed)", () => {
  const TEST_USER = "test-red-band-" + Date.now();

  beforeAll(async () => {
    await db.insert(approvalMatrixRules).values({
      actionClass: "test-red-action",
      bandClass: "RED",
      defaultState: "human-required",
      approver: "admin",
      confidenceThreshold: null,
      description: "Test RED-band action requiring human approval",
    }).onConflictDoNothing();
  });

  it("should return pending_human for RED-band actions", async () => {
    const { evaluateApproval } = await import("../../services/trust-governance");
    const result = await evaluateApproval(TEST_USER, "test-red-action", 1.0);
    expect(result.decision).toBe("pending_human");
    expect(result.reason).toContain("RED band");
  });

  it("should record pending decision in approval_decisions table", async () => {
    const [pending] = await db.select().from(approvalDecisions)
      .where(and(
        eq(approvalDecisions.userId, TEST_USER),
        eq(approvalDecisions.actionClass, "test-red-action"),
        eq(approvalDecisions.decision, "pending_human"),
      ))
      .orderBy(desc(approvalDecisions.decidedAt))
      .limit(1);
    expect(pending).toBeDefined();
    expect(pending.decision).toBe("pending_human");
  });

  it("should resolve pending approval via resolveApproval", async () => {
    const { resolveApproval } = await import("../../services/trust-governance");
    const [pending] = await db.select().from(approvalDecisions)
      .where(and(
        eq(approvalDecisions.userId, TEST_USER),
        eq(approvalDecisions.decision, "pending_human"),
      ))
      .orderBy(desc(approvalDecisions.decidedAt))
      .limit(1);

    if (pending) {
      const result = await resolveApproval(pending.id, "test-admin", "approved", "Test approval for integration test");
      expect(result.success).toBe(true);
      expect(result.decision).toBe("approved");

      const [resolved] = await db.select().from(approvalDecisions)
        .where(eq(approvalDecisions.id, pending.id))
        .limit(1);
      expect(resolved.decision).toBe("approved");
      expect(resolved.decidedBy).toBe("test-admin");
    }
  });

  afterAll(async () => {
    await db.delete(approvalDecisions).where(eq(approvalDecisions.userId, TEST_USER)).catch(() => {});
    await db.delete(approvalMatrixRules).where(eq(approvalMatrixRules.actionClass, "test-red-action")).catch(() => {});
  });
});

describe("Tenant Isolation Enforcement (DB-backed)", () => {
  it("should deny cross-tenant access", async () => {
    const { enforceTenantIsolation } = await import("../../services/trust-governance");
    const result = enforceTenantIsolation("user-alice", "user-bob", "video");
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("isolation violation");
  });

  it("should allow same-tenant access", async () => {
    const { enforceTenantIsolation } = await import("../../services/trust-governance");
    const result = enforceTenantIsolation("user-alice", "user-alice", "video");
    expect(result.allowed).toBe(true);
  });

  it("should throw TenantIsolationError on assertTenantOwnership", async () => {
    const { assertTenantOwnership } = await import("../../services/trust-governance");
    expect(() => assertTenantOwnership("alice", "bob", "content")).toThrow("Tenant isolation violation");
  });
});

describe("Kernel Seed Data", () => {
  it("should seed approval matrix rules and Agent Explanation Contract", async () => {
    const { seedKernelData } = await import("../seed");
    await seedKernelData();

    const [smartEditRule] = await db.select().from(approvalMatrixRules)
      .where(eq(approvalMatrixRules.actionClass, "smart-edit"))
      .limit(1);
    expect(smartEditRule).toBeDefined();
    expect(smartEditRule.bandClass).toBe("GREEN");

    const [schema] = await db.select().from(schemaRegistry)
      .where(eq(schemaRegistry.schemaName, "AgentExplanationContract"))
      .limit(1);
    expect(schema).toBeDefined();
    expect(schema.status).toBe("active");
    expect(schema.definition).toBeDefined();
    const def = schema.definition as any;
    expect(def.title).toBe("AgentExplanationContract");
    expect(def.required).toContain("agentName");
    expect(def.required).toContain("confidenceScore");
  });
});
