import { describe, expect, it } from "vitest"
import {
  parseTestReport,
  testReportOutcome,
  type TestReport,
} from "./test-report"

const report: TestReport = {
  kind: "test_report",
  schema_version: 1,
  conversation_id: "conversation",
  run_id: "run",
  workspace_id: null,
  execution_backend: "local",
  requested_command: "pytest -q",
  preview_truncated: false,
  execution: {
    command: "pytest -q",
    exit_code: 0,
    stdout: "3 passed",
    stderr: "",
    reason: "completed",
    started_at: "2026-10-11T14:00:00Z",
    duration_ms: 0,
    truncated: false,
    output_complete: true,
    result_available: true,
  },
  archive: { status: "saved", artifact_id: 12, error: null },
}

describe("structured test reports", () => {
  it("preserves large decimal artifact IDs without numeric conversion", () => {
    const artifactId = "9223372036854775807"
    const value = {
      ...report,
      archive: { ...report.archive, artifact_id: artifactId },
    }
    expect(parseTestReport(value)?.archive.artifact_id).toBe(artifactId)
    expect(parseTestReport(JSON.stringify(value))?.archive.artifact_id).toBe(
      artifactId
    )
    expect(
      parseTestReport({
        ...report,
        archive: { ...report.archive, artifact_id: Number.MAX_SAFE_INTEGER },
      })?.archive.artifact_id
    ).toBe(Number.MAX_SAFE_INTEGER)
  })

  it.each([
    Number.MAX_SAFE_INTEGER + 1,
    "0",
    "-12",
    "1.5",
    "1e18",
    " 12",
    "12/other",
  ])("rejects unsafe or invalid artifact ID %s", (artifact_id) => {
    expect(
      parseTestReport({
        ...report,
        archive: { ...report.archive, artifact_id },
      })
    ).toBeNull()
  })
  it("distinguishes chat preview limits from execution output loss", () => {
    const older: Partial<TestReport> = { ...report }
    delete older.preview_truncated
    expect(parseTestReport(older)?.preview_truncated).toBe(false)
    expect(
      parseTestReport({ ...report, preview_truncated: true })
    ).toMatchObject({
      preview_truncated: true,
      execution: { truncated: false, output_complete: true },
    })
  })
  it("accepts object and JSON results while preserving execution values", () => {
    expect(parseTestReport(report)).toEqual(report)
    expect(parseTestReport(JSON.stringify(report))).toEqual(report)
    expect(testReportOutcome(report)).toBe("success")
  })

  it("does not infer success from output text or successful archival", () => {
    const failed = {
      ...report,
      execution: { ...report.execution, exit_code: 2, stdout: "100 passed" },
    }
    expect(testReportOutcome(failed)).toBe("failed")
  })

  it("does not treat an archival failure as a command failure", () => {
    expect(
      testReportOutcome({
        ...report,
        archive: {
          status: "failed",
          artifact_id: null,
          error: "Storage unavailable",
        },
      })
    ).toBe("success")
  })

  it.each([
    "cancelled",
    "deadline",
    "output-limit",
    "execution-error",
    "connection-error",
  ] as const)("never treats %s with exit code zero as success", (reason) => {
    expect(
      testReportOutcome({
        ...report,
        execution: { ...report.execution, reason },
      })
    ).toBe("failed")
  })

  it("shows unknown when the result or the completed process exit code is unavailable", () => {
    expect(
      testReportOutcome({
        ...report,
        execution: { ...report.execution, result_available: false },
      })
    ).toBe("unknown")
    expect(
      testReportOutcome({
        ...report,
        execution: { ...report.execution, exit_code: null },
      })
    ).toBe("unknown")
    const unknown = {
      ...report,
      execution: {
        ...report.execution,
        duration_ms: null,
        started_at: null,
        truncated: true,
        output_complete: false,
        result_available: false,
      },
    }
    expect(parseTestReport(unknown)).toEqual(unknown)
  })

  it("preserves success with partial output but leaves completeness flags visible", () => {
    const partial = {
      ...report,
      execution: {
        ...report.execution,
        truncated: true,
        output_complete: false,
      },
    }
    expect(testReportOutcome(partial)).toBe("success")
    expect(parseTestReport(partial)?.execution).toMatchObject({
      truncated: true,
      output_complete: false,
    })
  })

  it.each([
    "3 passed",
    "{",
    null,
    [],
    { ...report, schema_version: 2 },
    { ...report, execution_backend: "unknown" },
    { ...report, execution: { ...report.execution, duration_ms: 1.5 } },
    { ...report, archive: { ...report.archive, artifact_id: null } },
    {
      ...report,
      archive: { status: "failed", artifact_id: 12, error: "failed" },
    },
    { ...report, execution: { ...report.execution, exit_code: "0" } },
    { ...report, execution: { ...report.execution, reason: "success" } },
    { ...report, execution: { ...report.execution, duration_ms: -1 } },
    { ...report, execution: { ...report.execution, duration_ms: Infinity } },
    { ...report, execution: { ...report.execution, started_at: "yesterday" } },
    {
      ...report,
      execution: {
        ...report.execution,
        started_at: "2026-10-11T14:00:00+08:00",
      },
    },
    { ...report, archive: { ...report.archive, artifact_id: -1 } },
  ])("rejects malformed or unsupported results %#", (value) => {
    expect(parseTestReport(value)).toBeNull()
  })

  it("accepts a UTC offset timestamp", () => {
    const value = {
      ...report,
      execution: {
        ...report.execution,
        started_at: "2026-10-11T14:00:00+00:00",
      },
    }
    expect(parseTestReport(value)).toEqual(value)
  })
})
