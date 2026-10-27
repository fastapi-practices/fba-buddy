"use client"

import { useEffect, useRef, useState, type FC } from "react"
import { useShikiHighlighter, type ShikiHighlighterProps } from "react-shiki"
import { cn } from "@/lib/utils"

/**
 * Props for the SyntaxHighlighter component
 */
export type SyntaxHighlighterProps = Omit<
  ShikiHighlighterProps,
  "children" | "theme"
> & {
  theme?: ShikiHighlighterProps["theme"]
  code: string
  /** Joins the code surface to a header rendered by its caller. */
  hasHeader?: boolean
  /** Skips tokenization and renders the plain code while `true`. */
  streaming?: boolean
}

const containerClassName =
  "shiki-base [&_pre]:border-border/50 [&_pre]:bg-muted/30! [&_.line]:px-0! [&_pre]:overflow-x-auto [&_pre]:rounded-xl [&_pre]:border [&_pre]:p-3.5 [&_pre]:text-[13px] [&_pre]:leading-relaxed"

const PlainCode: FC<{ code: string }> = ({ code }) => (
  <pre>
    <code>{code}</code>
  </pre>
)

const HighlightedCode: FC<{
  code: string
  language: SyntaxHighlighterProps["language"]
  theme: NonNullable<SyntaxHighlighterProps["theme"]>
  options: Omit<ShikiHighlighterProps, "children" | "language" | "theme">
}> = ({ code, language, theme, options }) => {
  const highlighted = useShikiHighlighter(code, language, theme, {
    ...options,
    defaultColor: "light-dark()",
  })
  return <>{highlighted ?? <PlainCode code={code} />}</>
}

/** Tokenization waits until streaming and any active text selection finish. */
export const SyntaxHighlighter: FC<SyntaxHighlighterProps> = ({
  code,
  language,
  theme = { dark: "github-dark-default", light: "github-light-default" },
  className,
  style,
  delay = 150, // the part settles before smooth streaming finishes draining, so code keeps changing for a few frames
  streaming = false,
  hasHeader = false,
  ...options
}) => {
  const rootRef = useRef<HTMLDivElement>(null)
  const [selectionHeld, setSelectionHeld] = useState(false)

  useEffect(() => {
    const updateSelection = () => {
      const selection = window.getSelection()
      const root = rootRef.current
      const inside = Boolean(
        selection &&
        !selection.isCollapsed &&
        root &&
        (root.contains(selection.anchorNode) ||
          root.contains(selection.focusNode))
      )
      setSelectionHeld((held) => inside && (streaming || held))
    }
    document.addEventListener("selectionchange", updateSelection)
    updateSelection()
    return () =>
      document.removeEventListener("selectionchange", updateSelection)
  }, [streaming])

  const plain = streaming || selectionHeld
  return (
    <div
      ref={rootRef}
      className={cn(
        containerClassName,
        hasHeader && "[&_pre]:rounded-t-none [&_pre]:border-t-0",
        streaming && "shiki-streaming",
        className
      )}
      style={style}
    >
      {plain ? (
        <PlainCode code={code} />
      ) : (
        <HighlightedCode
          code={code}
          language={language}
          theme={theme}
          options={{ ...options, delay }}
        />
      )}
    </div>
  )
}

SyntaxHighlighter.displayName = "SyntaxHighlighter"
