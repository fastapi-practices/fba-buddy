"use client"

import {
  CheckIcon,
  CircleDashedIcon,
  FileCodeIcon,
  FlaskConicalIcon,
  XIcon,
} from "lucide-react"
import type { ReactNode } from "react"

import { CodeBlock, CodeBlockContent } from "@/components/ui/code-block"
import { useT } from "@/hooks/use-t"
import {
  Trace,
  TraceCollapsible,
  TraceCollapsibleContent,
  TraceCollapsibleTrigger,
  TraceIcon,
  TraceLine,
  TraceTitle,
} from "@/components/ui/trace"

type TestResultStatus = "passed" | "failed" | "skipped"

export type TestResult = {
  name: string
  status: TestResultStatus
  error?: string
}

export type TestSuite = {
  name: string
  tests: readonly TestResult[]
}

function counts(tests: readonly TestResult[]) {
  return {
    total: tests.length,
    failed: tests.filter((test) => test.status === "failed").length,
    skipped: tests.filter((test) => test.status === "skipped").length,
  }
}

function summary(tests: readonly TestResult[], t: ReturnType<typeof useT>) {
  const value = counts(tests)
  return [
    t("common.testResultsRan", { n: value.total }),
    value.failed > 0
      ? t("common.testResultsFailedCount", { n: value.failed })
      : "",
    value.skipped > 0
      ? t("common.testResultsSkippedCount", { n: value.skipped })
      : "",
  ]
    .filter(Boolean)
    .join(", ")
}

function TestRow({
  test,
  t,
}: {
  test: TestResult
  t: ReturnType<typeof useT>
}) {
  if (test.status === "failed") {
    return (
      <TraceCollapsible defaultOpen>
        <TraceCollapsibleTrigger>
          <TraceLine status="error">
            <TraceIcon>
              <XIcon />
            </TraceIcon>
            <TraceTitle>{test.name}</TraceTitle>
          </TraceLine>
        </TraceCollapsibleTrigger>
        <TraceCollapsibleContent>
          <CodeBlock size="sm" variant="destructive">
            <CodeBlockContent wrap className="max-h-64">
              {test.error ?? t("common.testFailedDefault")}
            </CodeBlockContent>
          </CodeBlock>
        </TraceCollapsibleContent>
      </TraceCollapsible>
    )
  }
  return (
    <TraceLine>
      <TraceIcon>
        {test.status === "skipped" ? <CircleDashedIcon /> : <CheckIcon />}
      </TraceIcon>
      <TraceTitle>
        {test.status === "skipped"
          ? t("common.testSkipped", { name: test.name })
          : test.name}
      </TraceTitle>
    </TraceLine>
  )
}

export function TestResults({
  suites,
  running = false,
  command,
  className,
  fallback,
}: {
  suites: readonly TestSuite[]
  running?: boolean
  command?: string
  className?: string
  fallback?: ReactNode
}) {
  const t = useT()
  const tests = suites.flatMap((suite) => suite.tests)
  const failed = tests.filter((test) => test.status === "failed").length
  if (running || suites.length === 0) {
    return (
      <Trace>
        <TraceLine status={running ? "running" : "error"} className={className}>
          <TraceIcon>
            <FlaskConicalIcon />
          </TraceIcon>
          <TraceTitle>
            {running
              ? t("common.testResultsRunning")
              : t("common.testResultsFailed")}
            {command ? ` ${command}` : ""}
          </TraceTitle>
        </TraceLine>
        {!running && fallback ? <div className="mt-2">{fallback}</div> : null}
      </Trace>
    )
  }
  return (
    <Trace className={className} data-slot="test-results">
      <TraceCollapsible defaultOpen={failed > 0}>
        <TraceCollapsibleTrigger>
          <TraceLine status={failed > 0 ? "error" : undefined}>
            <TraceIcon>
              <FlaskConicalIcon />
            </TraceIcon>
            <TraceTitle>
              {t("common.testResultsRanSummary", {
                summary: summary(tests, t),
              })}
            </TraceTitle>
          </TraceLine>
        </TraceCollapsibleTrigger>
        <TraceCollapsibleContent keepMounted>
          <Trace>
            {suites.map((suite) => {
              const suiteCounts = counts(suite.tests)
              return (
                <TraceCollapsible
                  key={suite.name}
                  defaultOpen={suiteCounts.failed > 0}
                >
                  <TraceCollapsibleTrigger>
                    <TraceLine
                      status={suiteCounts.failed > 0 ? "error" : undefined}
                    >
                      <TraceIcon>
                        <FileCodeIcon />
                      </TraceIcon>
                      <TraceTitle>
                        {suite.name}, {summary(suite.tests, t)}
                      </TraceTitle>
                    </TraceLine>
                  </TraceCollapsibleTrigger>
                  <TraceCollapsibleContent keepMounted>
                    <Trace>
                      {suite.tests.map((test) => (
                        <TestRow key={test.name} test={test} t={t} />
                      ))}
                    </Trace>
                  </TraceCollapsibleContent>
                </TraceCollapsible>
              )
            })}
          </Trace>
        </TraceCollapsibleContent>
      </TraceCollapsible>
    </Trace>
  )
}
