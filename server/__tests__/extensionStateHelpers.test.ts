import test from "node:test";
import assert from "node:assert/strict";

// These pure helpers in the extension popup's state.js are documented (in
// CHANGELOG.md and inline JSDoc) as "the single source of truth" / "unit-tested
// with no DOM/chrome dependency", but no tests actually existed for them. This
// suite locks in their behaviour. The module imports cleanly under Node because
// constants come from globalThis with literal fallbacks and chrome/DOM are only
// touched inside functions (guarded by try/catch).
import {
  compareExtensionVersions,
  buildWorkflowSafetyState,
  validatePayloadPreflight,
  buildPayloadHealthScore,
  normalizeCareAssuranceBaseUrl,
  normalizeCareAssuranceOriginHost,
  isLikelyCareAssuranceUrl,
} from "../../extension/edge-acp-autofill/popup/state.js";

test("compareExtensionVersions orders semantic versions numerically", () => {
  assert.equal(compareExtensionVersions("0.9.0", "0.9.1"), -1);
  assert.equal(compareExtensionVersions("0.9.1", "0.9.0"), 1);
  assert.equal(compareExtensionVersions("1.0.0", "1.0.0"), 0);
  // 10 > 9 numerically (not lexically)
  assert.equal(compareExtensionVersions("0.10.0", "0.9.9"), 1);
  // tolerates a leading "v" and missing trailing segments
  assert.equal(compareExtensionVersions("v0.8.1", "0.8.1"), 0);
  assert.equal(compareExtensionVersions("1.0", "1.0.0"), 0);
  // pre-release suffixes compare by their leading integer
  assert.equal(compareExtensionVersions("1.2.0-beta", "1.2.0"), 0);
  assert.equal(compareExtensionVersions("1.2.1-beta", "1.2.0"), 1);
});

test("buildWorkflowSafetyState is ready with no guards triggered", () => {
  const result = buildWorkflowSafetyState({});
  assert.equal(result.severity, "ready");
  assert.equal(result.code, "ready");
  assert.equal(result.shouldBlockStart, false);
  assert.equal(result.shouldBlockUploadSync, false);
  assert.equal(result.selectedCaseId, "");
  assert.equal(result.payloadCaseId, "");
});

test("buildWorkflowSafetyState blocks when the attached page needs reloading", () => {
  const result = buildWorkflowSafetyState({
    pageContext: { requiresPageRefresh: true },
  });
  assert.equal(result.code, "page-refresh-required");
  assert.equal(result.severity, "blocking");
  assert.equal(result.shouldBlockStart, true);
  // a reload does not require re-syncing uploads
  assert.equal(result.shouldBlockUploadSync, false);
  assert.equal(result.action, "reload-page");
});

test("buildWorkflowSafetyState flags a selected-user / target case mismatch", () => {
  const result = buildWorkflowSafetyState({
    selectedAutofillUser: { acpId: "100" },
    caseId: "200",
  });
  assert.equal(result.code, "selected-case-mismatch");
  assert.equal(result.severity, "blocking");
  assert.equal(result.shouldBlockStart, true);
  assert.equal(result.shouldBlockUploadSync, true);
  assert.equal(result.selectedCaseId, "100");
});

test("buildWorkflowSafetyState flags a staged-payload / target case mismatch", () => {
  const result = buildWorkflowSafetyState({
    payload: { caseId: "300" },
    caseId: "200",
  });
  assert.equal(result.code, "payload-case-mismatch");
  assert.equal(result.severity, "blocking");
  assert.equal(result.shouldBlockStart, true);
  assert.equal(result.shouldBlockUploadSync, false);
  assert.equal(result.payloadCaseId, "300");
});

test("buildWorkflowSafetyState requires a case id and a service data group when asked", () => {
  const missingCase = buildWorkflowSafetyState({ requireCaseId: true });
  assert.equal(missingCase.code, "case-id-missing");
  assert.equal(missingCase.shouldBlockStart, true);
  assert.equal(missingCase.shouldBlockUploadSync, true);

  const missingGroup = buildWorkflowSafetyState({
    requireServiceDataGroup: true,
    caseId: "200",
  });
  assert.equal(missingGroup.code, "service-group-missing");
  assert.equal(missingGroup.shouldBlockStart, true);
  assert.equal(missingGroup.shouldBlockUploadSync, false);
});

test("buildWorkflowSafetyState surfaces a status error as a non-blocking warning", () => {
  const result = buildWorkflowSafetyState({
    caseId: "200",
    extensionStatus: { statusError: "Heartbeat lost" },
  });
  assert.equal(result.severity, "warning");
  assert.equal(result.code, "extension-status-error");
  assert.equal(result.detail, "Heartbeat lost");
  assert.equal(result.shouldBlockStart, false);
});

test("buildWorkflowSafetyState compares installed vs server version when chrome is present", () => {
  const original = (globalThis as Record<string, unknown>).chrome;
  try {
    (globalThis as Record<string, unknown>).chrome = {
      runtime: { getManifest: () => ({ version: "0.9.0" }) },
    };

    const behind = buildWorkflowSafetyState({
      caseId: "200",
      extensionStatus: { version: "0.9.1" },
    });
    assert.equal(behind.code, "update-available");
    assert.equal(behind.severity, "warning");

    const ahead = buildWorkflowSafetyState({
      caseId: "200",
      extensionStatus: { version: "0.8.0" },
    });
    assert.equal(ahead.code, "environment-mismatch");
    assert.equal(ahead.severity, "warning");
  } finally {
    if (original === undefined) {
      delete (globalThis as Record<string, unknown>).chrome;
    } else {
      (globalThis as Record<string, unknown>).chrome = original;
    }
  }
});

test("validatePayloadPreflight blocks a missing payload", () => {
  const result = validatePayloadPreflight(null, { caseId: "1" });
  assert.equal(result.ok, false);
  assert.ok(result.blockers.some((b) => /No payload staged/i.test(b)));
});

test("validatePayloadPreflight passes a complete ACP payload with only warnings", () => {
  const result = validatePayloadPreflight(
    { formType: "acp", assessments: [{ name: "Mobility", body: "Some content" }] },
    { caseId: "1" },
  );
  assert.equal(result.ok, true);
  assert.equal(result.blockers.length, 0);
  // missing service data group is a warning, not a blocker
  assert.ok(result.warnings.some((w) => /Service Data Group ID/i.test(w)));
});

test("validatePayloadPreflight blocks empty assessments and a missing case id", () => {
  const result = validatePayloadPreflight(
    { formType: "acp", assessments: [] },
    { caseId: "", serviceDataGroupId: "1017650" },
  );
  assert.equal(result.ok, false);
  assert.ok(result.blockers.some((b) => /Case ID is required/i.test(b)));
  assert.ok(result.blockers.some((b) => /no assessments/i.test(b)));
});

test("buildPayloadHealthScore returns a perfect score for a clean payload", () => {
  const result = buildPayloadHealthScore({
    formType: "acp",
    serviceUserName: "Jane Doe",
    timestamp: new Date().toISOString(),
    assessments: [{ name: "Mobility", body: "Detailed, person-centred narrative." }],
  });
  assert.equal(result.score, 100);
  assert.equal(result.level, "excellent");
  assert.deepEqual(result.issues, []);
});

test("buildPayloadHealthScore penalises a missing payload and empty content", () => {
  assert.deepEqual(buildPayloadHealthScore(null), {
    score: 0,
    level: "poor",
    issues: ["No payload staged"],
  });

  const result = buildPayloadHealthScore({ formType: "acp", assessments: [] });
  // 50 (no assessments) + 10 (no service user name) = 60 deductions -> score 40
  assert.equal(result.score, 40);
  assert.equal(result.level, "fair");
  assert.ok(result.issues.some((i) => /No assessments/i.test(i)));
  assert.ok(result.issues.some((i) => /Service user name/i.test(i)));
});

test("normalizeCareAssuranceBaseUrl normalises hosts and schemes", () => {
  assert.equal(normalizeCareAssuranceBaseUrl("https://example.com/"), "https://example.com");
  assert.equal(normalizeCareAssuranceBaseUrl("example.com"), "https://example.com");
  assert.equal(normalizeCareAssuranceBaseUrl("localhost:5000"), "http://localhost:5000");
  assert.equal(normalizeCareAssuranceBaseUrl("127.0.0.1:5000"), "http://127.0.0.1:5000");
});

test("normalizeCareAssuranceOriginHost extracts a lowercase host", () => {
  assert.equal(normalizeCareAssuranceOriginHost("https://Example.com/path"), "example.com");
  assert.equal(normalizeCareAssuranceOriginHost("Example.com/"), "example.com");
  assert.equal(normalizeCareAssuranceOriginHost(""), "");
});

test("isLikelyCareAssuranceUrl recognises known hosts and rejects others", () => {
  assert.equal(isLikelyCareAssuranceUrl("https://careassurance.uk/dashboard"), true);
  assert.equal(isLikelyCareAssuranceUrl("https://www.careassurance.uk/"), true);
  assert.equal(isLikelyCareAssuranceUrl("https://example.com"), false);
  assert.equal(isLikelyCareAssuranceUrl(""), false);
});
