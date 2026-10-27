"use client"

import "katex/dist/katex.min.css"
import {
  type FC,
  createContext,
  memo,
  useContext,
  useLayoutEffect,
  useMemo,
  useRef,
} from "react"
import {
  CheckIcon,
  CopyIcon,
  WrapTextIcon,
  InfoIcon,
  LightbulbIcon,
  TriangleAlertIcon,
} from "lucide-react"
import { selectedMarkdown } from "@/features/chat/markdown-enhancements"
import { useCodeWrapPreference } from "@/features/chat/render-preferences"
import {
  RunCodeButton,
  WorkspaceLink,
  parseWorkspaceLink,
} from "@/features/chat/workspace-actions"
import { DirectiveTextChip } from "./directive-text"
import {
  DIRECTIVE_FALLBACK_ICON,
  DIRECTIVE_ICONS,
} from "@/features/chat/directive-icons"
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert"
import { MarkdownSourceContext } from "./markdown-source"
import { MarkdownMedia } from "./markdown-media"
import {
  ConversationLink,
  MarkdownExternalLink,
  ArtifactTemplate,
} from "./markdown-links"
import { InlineQuote } from "./quote"
import { parseInlineQuote } from "@/features/chat/transcript-quote-selector"
import ReactMarkdown, { type Components } from "react-markdown"
import { SyntaxHighlighter as PlainHighlighter } from "./shiki-highlighter"

import {
  remarkPlugins,
  rehypePlugins,
  markdownUrl,
  userRemarkPlugins,
} from "@/features/chat/markdown-plugins"
import { MarkdownTable } from "./markdown-table"
import { MermaidDiagram } from "@/components/ai-elements/mermaid-diagram-runtime"
import { SyntaxHighlighter } from "@/components/ai-elements/shiki-highlighter-runtime"
import { TooltipIconButton } from "@/components/ai-elements/tooltip-icon-button"
import { useCopyToClipboard } from "@/hooks/use-copy-to-clipboard"
import { useT } from "@/hooks/use-t"
import { cn } from "@/lib/utils"

type MarkdownTextProps = {
  text?: string
  components?: Components
  preserveLineBreaks?: boolean
}
type CodeHeaderProps = {
  language: string
  code: string
  node?: { properties?: Record<string, unknown> }
}
const memoizeMarkdownComponents = <T,>(components: T): T => components
const MarkdownAnchorContext = createContext(false)

const useShallowStable = <T extends Record<string, unknown> | undefined>(
  value: T
): T => {
  const ref = useRef(value)
  if (value !== ref.current) {
    const prev = ref.current
    const stable =
      value !== undefined &&
      prev !== undefined &&
      Object.keys(prev).length === Object.keys(value).length &&
      Object.keys(value).every((key) => prev[key] === value[key])
    if (!stable) ref.current = value
  }
  return ref.current
}

const MarkdownTextImpl: FC<MarkdownTextProps> = ({
  components,
  text,
  preserveLineBreaks = false,
}) => {
  const stableComponents = useShallowStable(components)
  const markdownComponents = useMemo(() => {
    if (!stableComponents) return defaultComponents
    return {
      ...defaultComponents,
      ...memoizeMarkdownComponents(stableComponents),
    }
  }, [stableComponents])

  return (
    <MarkdownSourceContext value={text ?? ""}>
      <div
        onCopy={(event) => {
          const selection = window.getSelection()
          if (
            !selection ||
            selection.isCollapsed ||
            !event.currentTarget.contains(selection.anchorNode) ||
            !event.currentTarget.contains(selection.focusNode)
          )
            return
          const markdown = selectedMarkdown(
            selection.getRangeAt(0).cloneContents()
          )
          if (!markdown) return
          event.preventDefault()
          event.clipboardData.setData("text/plain", markdown)
        }}
      >
        <div className="markdown">
          <ReactMarkdown
            urlTransform={markdownUrl}
            remarkPlugins={
              preserveLineBreaks ? userRemarkPlugins : remarkPlugins
            }
            rehypePlugins={rehypePlugins}
            components={{ ...markdownComponents, pre: StandaloneCodeBlock }}
          >
            {text ?? ""}
          </ReactMarkdown>
        </div>
      </div>
    </MarkdownSourceContext>
  )
}

export const MarkdownText = memo(MarkdownTextImpl)

const StandaloneCodeBlock: NonNullable<Components["pre"]> = ({
  node,
  children,
  ...props
}) => {
  const element = node?.children.find(
    (child) => child.type === "element" && child.tagName === "code"
  )
  if (!element || element.type !== "element")
    return <pre {...props}>{children}</pre>
  const code = element.children
    .map((child) => (child.type === "text" ? child.value : ""))
    .join("")
  const language = String(element.properties.className ?? "").replace(
    "language-",
    ""
  )
  if (language === "mermaid") {
    return <MermaidDiagram code={code} language="mermaid" />
  }
  return (
    <div>
      <CodeHeader node={element} code={code} language={language} />
      <PlainHighlighter code={code} language={language} hasHeader />
    </div>
  )
}

const CodeHeader: FC<CodeHeaderProps> = ({ language, code, node }) => {
  const t = useT()
  const [wrapped, setWrapped] = useCodeWrapPreference()
  const headerRef = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    headerRef.current?.nextElementSibling?.classList.toggle(
      "code-wrapped",
      wrapped
    )
  }, [wrapped, code])
  const title = String(node?.properties?.dataFenceTitle ?? "")
  const { isCopied, copyToClipboard } = useCopyToClipboard()
  const onCopy = () => {
    if (!code || isCopied) return
    copyToClipboard(code)
  }

  return (
    <div
      ref={headerRef}
      data-find-ignore
      className="code-header-root mt-3 flex items-center justify-between gap-2 rounded-t-xl border border-b-0 border-border/50 bg-muted/50 px-3.5 py-1.5 text-xs"
    >
      <span className="code-header-language min-w-0 truncate font-medium text-muted-foreground">
        {title || language}
      </span>
      <div className="flex shrink-0 items-center gap-1">
        <RunCodeButton code={code} language={language} />
        <TooltipIconButton
          tooltip={t(wrapped ? "common.disableLineWrap" : "common.wrapLines")}
          aria-pressed={wrapped}
          onClick={() => setWrapped(!wrapped)}
        >
          <WrapTextIcon />
        </TooltipIconButton>
        <TooltipIconButton
          tooltip={t("common.copy")}
          side="top"
          onClick={onCopy}
        >
          {!isCopied && (
            <CopyIcon className="animate-in duration-150 zoom-in-75 fade-in" />
          )}
          {isCopied && (
            <CheckIcon className="animate-in duration-200 ease-out zoom-in-50 fade-in" />
          )}
        </TooltipIconButton>
      </div>
    </div>
  )
}

const defaultComponents: Components & {
  CodeHeader: FC<CodeHeaderProps>
  SyntaxHighlighter?: typeof SyntaxHighlighter
} = {
  ...({
    SyntaxHighlighter,
    h1: ({ className, ...props }) => (
      <h1
        className={cn(
          "markdown-h1 mt-5 mb-2 scroll-m-20 text-xl font-semibold first:mt-0 last:mb-0",
          className
        )}
        {...props}
      />
    ),
    h2: ({ className, ...props }) => (
      <h2
        className={cn(
          "markdown-h2 mt-5 mb-2 scroll-m-20 text-lg font-semibold first:mt-0 last:mb-0",
          className
        )}
        {...props}
      />
    ),
    h3: ({ className, ...props }) => (
      <h3
        className={cn(
          "markdown-h3 mt-4 mb-1.5 scroll-m-20 text-base font-semibold first:mt-0 last:mb-0",
          className
        )}
        {...props}
      />
    ),
    h4: ({ className, ...props }) => (
      <h4
        className={cn(
          "markdown-h4 mt-3.5 mb-1 scroll-m-20 text-base font-medium first:mt-0 last:mb-0",
          className
        )}
        {...props}
      />
    ),
    h5: ({ className, ...props }) => (
      <h5
        className={cn(
          "markdown-h5 mt-3 mb-1 text-sm font-semibold first:mt-0 last:mb-0",
          className
        )}
        {...props}
      />
    ),
    h6: ({ className, ...props }) => (
      <h6
        className={cn(
          "markdown-h6 mt-3 mb-1 text-sm font-medium first:mt-0 last:mb-0",
          className
        )}
        {...props}
      />
    ),
    p: ({ className, ...props }) => (
      <p
        className={cn(
          "markdown-p my-3 leading-relaxed first:mt-0 last:mb-0",
          className
        )}
        {...props}
      />
    ),
    a: ({ className, href, children, ...props }) => (
      <MarkdownAnchorContext value={true}>
        {href && parseInlineQuote(href) ? (
          <InlineQuote anchor={parseInlineQuote(href)!} />
        ) : href && /^(?:fba|t3)-thread:\/\/[a-zA-Z\d_-]{1,128}$/.test(href) ? (
          <ConversationLink id={href.split("//")[1]!}>
            {children}
          </ConversationLink>
        ) : href?.startsWith("#aui-directive/") ? (
          (() => {
            const [type = "", id = "", label = ""] = href
              .slice(15)
              .split("/")
              .map(decodeURIComponent)
            return (
              <DirectiveTextChip
                type={type}
                id={id}
                label={label}
                iconMap={DIRECTIVE_ICONS}
                fallbackIcon={DIRECTIVE_FALLBACK_ICON}
              />
            )
          })()
        ) : href && !href.startsWith("//") && parseWorkspaceLink(href) ? (
          <WorkspaceLink href={href}>{children}</WorkspaceLink>
        ) : href && /^(https?:)?\/\//i.test(href) ? (
          <MarkdownExternalLink
            {...props}
            className={cn(
              "text-primary underline underline-offset-4",
              className
            )}
            href={href}
          >
            {children}
          </MarkdownExternalLink>
        ) : (
          <a
            className={cn(
              "markdown-a text-primary underline underline-offset-2 hover:text-primary/80",
              className
            )}
            {...props}
            href={href}
            title={href}
            onClick={(event) => {
              if (!href?.startsWith("#") || event.metaKey || event.ctrlKey)
                return
              event.preventDefault()
              const scope = event.currentTarget.closest(".markdown")
              let target: HTMLElement | undefined
              try {
                target = Array.from(
                  scope?.querySelectorAll<HTMLElement>("[id]") ?? []
                ).find(
                  (element) => element.id === decodeURIComponent(href.slice(1))
                )
              } catch {
                return
              }
              if (!target) return
              event.preventDefault()
              const viewport = event.currentTarget
                .closest(".thread-root")
                ?.querySelector<HTMLElement>(
                  '[data-slot="thread-viewport"]'
                )
              if (viewport)
                viewport.scrollTo({
                  top:
                    target.getBoundingClientRect().top -
                    viewport.getBoundingClientRect().top +
                    viewport.scrollTop,
                  behavior: "smooth",
                })
              else
                target.scrollIntoView({ block: "nearest", behavior: "smooth" })
            }}
            {...(href && /^(https?:)?\/\//i.test(href)
              ? { target: "_blank", rel: "noopener noreferrer" }
              : {})}
          >
            {children}
          </a>
        )}
      </MarkdownAnchorContext>
    ),
    blockquote: ({ className, ...props }) => (
      <blockquote
        className={cn(
          "markdown-blockquote my-3 border-s-2 border-muted-foreground/30 ps-4 text-muted-foreground",
          className
        )}
        {...props}
      />
    ),
    ul: ({ className, ...props }) => (
      <ul
        className={cn(
          "markdown-ul my-3 ms-5 list-disc marker:text-muted-foreground [&>li]:mt-1",
          className
        )}
        {...props}
      />
    ),
    ol: ({ className, ...props }) => (
      <ol
        className={cn(
          "markdown-ol my-3 ms-5 list-decimal marker:text-muted-foreground [&>li]:mt-1",
          className
        )}
        {...props}
      />
    ),
    hr: ({ className, ...props }) => (
      <hr
        className={cn("markdown-hr my-3 border-muted-foreground/20", className)}
        {...props}
      />
    ),
    th: ({ className, ...props }) => (
      <th
        className={cn(
          "markdown-th bg-muted px-3 py-1.5 text-start font-medium first:rounded-ss-lg last:rounded-se-lg [[align=center]]:text-center [[align=right]]:text-right",
          className
        )}
        {...props}
      />
    ),
    td: ({ className, ...props }) => (
      <td
        className={cn(
          "markdown-td border-s border-b border-muted-foreground/20 px-3 py-1.5 text-start last:border-e [[align=center]]:text-center [[align=right]]:text-right",
          className
        )}
        {...props}
      />
    ),
    tr: ({ className, ...props }) => (
      <tr
        className={cn(
          "markdown-tr m-0 border-b p-0 first:border-t [&:last-child>td:first-child]:rounded-es-lg [&:last-child>td:last-child]:rounded-ee-lg",
          className
        )}
        {...props}
      />
    ),
    li: ({ className, ...props }) => (
      <li className={cn("markdown-li leading-relaxed", className)} {...props} />
    ),
    strong: ({ className, ...props }) => (
      <strong
        className={cn("markdown-strong font-semibold", className)}
        {...props}
      />
    ),
    sup: ({ className, ...props }) => (
      <sup
        className={cn("markdown-sup [&>a]:text-xs [&>a]:no-underline", className)}
        {...props}
      />
    ),
    pre: ({ className, ...props }) => (
      <pre
        className={cn(
          "markdown-pre overflow-x-auto rounded-t-none rounded-b-xl border border-t-0 border-border/50 bg-muted/30 p-3.5 text-[13px] leading-relaxed",
          className
        )}
        {...props}
      />
    ),
    code: function Code({ className, ...props }) {
      const isCodeBlock =
        typeof className === "string" && /(?:^|\s)language-/.test(className)
      const inLink = useContext(MarkdownAnchorContext)
      const value = typeof props.children === "string" ? props.children : ""
      return (
        <code
          className={cn(
            !isCodeBlock &&
              "markdown-inline-code rounded-md bg-muted px-1.5 py-0.5 font-mono text-[0.85em]",
            className
          )}
          {...props}
        >
          {!isCodeBlock && !inLink && parseWorkspaceLink(value) ? (
            <WorkspaceLink href={value}>{props.children}</WorkspaceLink>
          ) : (
            props.children
          )}
        </code>
      )
    },
  }),
  div: ({ node, children, ...props }) => {
    const value = node?.properties?.dataArtifactTemplate
    if (typeof value === "string") {
      try {
        const attributes = JSON.parse(value)
        if (
          attributes &&
          typeof attributes.display_name === "string" &&
          typeof attributes.skill_name === "string"
        )
          return <ArtifactTemplate attributes={attributes} />
      } catch {
        /* 无效指令继续显示原文 */
      }
    }
    return <div {...props}>{children}</div>
  },
  CodeHeader,
  blockquote: ({ node, children, ...props }) => {
    const kind = String(node?.properties?.dataAlert ?? "")
    if (!kind)
      return (
        <blockquote
          className="markdown-blockquote my-3 border-s-2 border-muted-foreground/30 ps-4 text-muted-foreground"
          {...props}
        >
          {children}
        </blockquote>
      )
    const Icon =
      kind === "TIP"
        ? LightbulbIcon
        : ["WARNING", "CAUTION"].includes(kind)
          ? TriangleAlertIcon
          : InfoIcon
    return (
      <Alert
        role="note"
        variant={kind === "CAUTION" ? "destructive" : "default"}
        className="my-3"
      >
        <Icon />
        <AlertTitle>{kind}</AlertTitle>
        <AlertDescription>{children}</AlertDescription>
      </Alert>
    )
  },
  img: ({ node, src, alt, ...props }) => (
    <MarkdownMedia
      {...props}
      src={typeof src === "string" ? src : ""}
      alt={alt ?? ""}
      standalone={
        node?.properties?.dataStandalone === true ||
        node?.properties?.dataStandalone === "true"
      }
    />
  ),
  table: MarkdownTable,
}
