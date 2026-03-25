import { db } from "../db";
import { learningSignals, signalRegistry } from "@shared/schema";
import { eq, desc } from "drizzle-orm";
import { emitLearningSignal, seedSignalRegistry } from "../kernel/learning";

async function runTests() {
  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, label: string) {
    if (condition) {
      console.log(`  ✓ ${label}`);
      passed++;
    } else {
      console.error(`  ✗ ${label}`);
      failed++;
    }
  }

  console.log("\n=== Learning Signal Infrastructure Tests ===\n");

  console.log("Test 1: seedSignalRegistry seeds initial signal types");
  try {
    const seeded = await seedSignalRegistry();
    const allEntries = await db.select().from(signalRegistry);
    assert(allEntries.length >= 7, `Signal registry has at least 7 entries (found ${allEntries.length})`);
    const names = allEntries.map(e => e.signalName);
    assert(names.includes("smart_edit_completed"), "Registry contains smart_edit_completed");
    assert(names.includes("smart_edit_failed"), "Registry contains smart_edit_failed");
    assert(names.includes("performance_check_completed"), "Registry contains performance_check_completed");
    assert(names.includes("approval_denied"), "Registry contains approval_denied");
    assert(names.includes("feature_flag_blocked"), "Registry contains feature_flag_blocked");
    assert(names.includes("upload_completed"), "Registry contains upload_completed");
    assert(names.includes("metadata_updated"), "Registry contains metadata_updated");

    const smartEditEntry = allEntries.find(e => e.signalName === "smart_edit_completed");
    assert(smartEditEntry?.weightClass === "standard", "smart_edit_completed has weightClass=standard");
    assert(smartEditEntry?.decayStrategy === "linear", "smart_edit_completed has decayStrategy=linear");
    assert(smartEditEntry?.retentionDays === 365, "smart_edit_completed has retentionDays=365");
  } catch (err) {
    console.error("  ✗ seedSignalRegistry threw:", err);
    failed++;
  }

  console.log("\nTest 2: emitLearningSignal writes classified signal to learning_signals");
  try {
    const signalId = await emitLearningSignal({
      signalType: "smart_edit_completed",
      sourceSystem: "smart-edit-engine",
      payload: { videoId: 1, gameName: "Test Game", segmentCount: 5 },
      agentName: "ai-editor",
      userId: "test-user-learning-signal",
      channelId: 42,
      confidence: 0.85,
    });

    assert(typeof signalId === "number" && signalId > 0, `Signal was inserted with id=${signalId}`);

    const [row] = await db
      .select()
      .from(learningSignals)
      .where(eq(learningSignals.id, signalId))
      .limit(1);

    assert(!!row, "Signal row exists in learning_signals table");
    assert(row.signalType === "smart_edit_completed", "signalType matches");
    assert(row.category === "smart-edit-engine", "category matches source system");
    assert(row.userId === "test-user-learning-signal", "userId matches");
    assert(row.sourceAgent === "ai-editor", "sourceAgent matches agentName");
    assert(row.confidence === 0.85, `confidence is 0.85 (got ${row.confidence})`);
    assert(row.bandClass === "GREEN", `bandClass is GREEN for standard weight (got ${row.bandClass})`);
    assert((row.value as any)?.channelId === 42, "channelId in payload");
    assert((row.value as any)?.gameName === "Test Game", "payload data preserved");
  } catch (err) {
    console.error("  ✗ emitLearningSignal threw:", err);
    failed++;
  }

  console.log("\nTest 3: unregistered signal type emits warning but doesn't crash");
  try {
    const signalId = await emitLearningSignal({
      signalType: "totally_unregistered_signal_type_xyz",
      sourceSystem: "test-system",
      payload: { test: true },
      userId: "test-user-unregistered",
      confidence: 0.3,
    });

    assert(typeof signalId === "number" && signalId > 0, `Unregistered signal was still inserted with id=${signalId}`);

    const [row] = await db
      .select()
      .from(learningSignals)
      .where(eq(learningSignals.id, signalId))
      .limit(1);

    assert(!!row, "Unregistered signal row exists");
    assert(row.signalType === "totally_unregistered_signal_type_xyz", "Unregistered signal type preserved");
  } catch (err) {
    console.error("  ✗ Unregistered signal emission crashed (should not happen):", err);
    failed++;
  }

  console.log("\nTest 4: idempotent seeding does not duplicate entries");
  try {
    await seedSignalRegistry();
    await seedSignalRegistry();
    const allEntries = await db.select().from(signalRegistry);
    const smartEditEntries = allEntries.filter(e => e.signalName === "smart_edit_completed");
    assert(smartEditEntries.length === 1, `No duplicate smart_edit_completed entries (found ${smartEditEntries.length})`);
  } catch (err) {
    console.error("  ✗ Idempotent seeding threw:", err);
    failed++;
  }

  console.log("\n--- Cleanup ---");
  try {
    await db.delete(learningSignals).where(eq(learningSignals.userId, "test-user-learning-signal"));
    await db.delete(learningSignals).where(eq(learningSignals.userId, "test-user-unregistered"));
    console.log("  Cleaned up test data");
  } catch (err) {
    console.error("  Cleanup failed:", err);
  }

  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error("Test runner failed:", err);
  process.exit(1);
});
