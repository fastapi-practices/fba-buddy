import { z } from "zod"

const testReportSchema = z.object({
  kind: z.literal("test_report"),
  schema_version: z.literal(1),
  conversation_id: z.string().min(1),
  run_id: z.string().min(1),
  workspace_id: z.string().min(1).nullable(),
  execution_backend: z.enum(["local", "sandbox"]),
  requested_command: z.string(),
  preview_truncated: z.boolean().default(false),
  suites: z
    .array(
      z.object({
        name: z.string(),
        tests: z.array(
          z.object({
            name: z.string(),
            status: z.enum(["passed", "failed", "skipped"]),
            error: z.string().optional(),
          })
        ),
      })
    )
    .optional(),
  execution: z.object({
    command: z.string(),
    exit_code: z.number().int().nullable(),
    stdout: z.string(),
    stderr: z.string(),
    reason: z.enum([
      "completed",
      "cancelled",
      "deadline",
      "output-limit",
      "execution-error",
      "connection-error",
    ]),
    started_at: z.iso
      .datetime({ offset: true })
      .refine((value) => /(?:Z|\+00:00|-00:00)$/.test(value))
      .nullable(),
    duration_ms: z.number().int().nonnegative().nullable(),
    truncated: z.boolean(),
    output_complete: z.boolean(),
    result_available: z.boolean(),
  }),
  archive: z.discriminatedUnion("status", [
    z.object({
      status: z.literal("saved"),
      artifact_id: z.union([
        z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
        z.string().regex(/^[1-9]\d*$/),
      ]),
      error: z.string().nullable(),
    }),
    z.object({
      status: z.literal("failed"),
      artifact_id: z.null(),
      error: z.string().nullable(),
    }),
  ]),
})

export type TestReport = z.infer<typeof testReportSchema>

export function parseTestReport(value: unknown): TestReport | null {
  let input = value
  if (typeof input === "string") {
    try {
      input = JSON.parse(input)
    } catch {
      return null
    }
  }
  const result = testReportSchema.safeParse(input)
  return result.success ? result.data : null
}

export function testReportOutcome(
  report: TestReport
): "success" | "failed" | "unknown" {
  const execution = report.execution
  if (!execution.result_available) return "unknown"
  if (execution.reason === "completed")
    return execution.exit_code === 0
      ? "success"
      : execution.exit_code === null
        ? "unknown"
        : "failed"
  return "failed"
}
