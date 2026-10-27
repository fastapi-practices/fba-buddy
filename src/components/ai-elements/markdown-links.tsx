"use client"

import { useEffect, useState, type ReactNode, type ComponentProps } from "react"
import { useNavigate } from "react-router"
import { useChatRuntime } from "@/features/chat/chat-runtime"
import { MessageSquareIcon } from "lucide-react"
import {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuGroup,
  ContextMenuItem,
} from "@/components/ui/context-menu"
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardAction,
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { FilePreview } from "./file-preview"
import { fileMimeType, mediaKind } from "@/shared/file-reference"
import { getConversation } from "@/api/conversations"
import { useCopyToClipboard } from "@/hooks/use-copy-to-clipboard"
import { useT } from "@/hooks/use-t"
import { toast } from "@/components/ui/toast"

export function ConversationLink({
  id,
  children,
}: {
  id: string
  children: ReactNode
}) {
  const navigate = useNavigate()
  const [title, setTitle] = useState("")
  useEffect(() => {
    let active = true
    void getConversation(id, { messageLimit: 1 })
      .then((value) => {
        if (active) setTitle(value.title)
      })
      .catch(() => {})
    return () => {
      active = false
    }
  }, [id])
  return (
    <Button
      variant="link"
      size="sm"
      className="inline-flex h-auto max-w-full px-1 py-0 align-baseline"
      onClick={() => navigate(`/chat/${encodeURIComponent(id)}`)}
    >
      <MessageSquareIcon data-icon="inline-start" />
      <span className="truncate">{title || children}</span>
    </Button>
  )
}

export function MarkdownExternalLink({
  href,
  children,
  ...props
}: ComponentProps<"a"> & { href: string }) {
  const t = useT()
  const { copyToClipboard } = useCopyToClipboard()
  const [open, setOpen] = useState(false)
  const kind = mediaKind(href)
  const name = (() => {
    try {
      return decodeURIComponent(
        new URL(href).pathname.split("/").at(-1) || href
      )
    } catch {
      return href
    }
  })()
  return (
    <>
      <ContextMenu>
        <ContextMenuTrigger render={<span className="inline" />}>
          <a
            {...props}
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(event) => {
              props.onClick?.(event)
              if (
                kind &&
                !event.defaultPrevented &&
                !event.metaKey &&
                !event.ctrlKey &&
                !event.shiftKey &&
                !event.altKey
              ) {
                event.preventDefault()
                setOpen(true)
              }
            }}
          >
            {children}
          </a>
        </ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuGroup>
            {window.buddyDesktop?.openWebPreview ? (
              <ContextMenuItem
                onClick={() => {
                  void window
                    .buddyDesktop!.openWebPreview(
                      new URL(href, window.location.href).href
                    )
                    .catch((error: unknown) => {
                      toast.add({
                        type: "error",
                        title:
                          error instanceof Error
                            ? error.message
                            : t("common.couldNotLoadPreview"),
                      })
                    })
                }}
              >
                {t("common.openInApp")}
              </ContextMenuItem>
            ) : null}
            {kind ? (
              <ContextMenuItem onClick={() => setOpen(true)}>
                {t("common.showPreview")}
              </ContextMenuItem>
            ) : null}
            <ContextMenuItem onClick={() => copyToClipboard(href)}>
              {t("common.copyLink")}
            </ContextMenuItem>
            <ContextMenuItem
              onClick={() => window.open(href, "_blank", "noopener,noreferrer")}
            >
              {t("common.openInBrowser")}
            </ContextMenuItem>
          </ContextMenuGroup>
        </ContextMenuContent>
      </ContextMenu>
      {kind && open ? (
        <FilePreview
          name={name}
          src={href}
          mimeType={fileMimeType(href)}
          open={open}
          onOpenChange={setOpen}
        />
      ) : null}
    </>
  )
}

export function ArtifactTemplate({
  attributes,
}: {
  attributes: Record<string, string>
}) {
  const runtime = useChatRuntime()
  const t = useT()
  const name = attributes.display_name ?? attributes.skill_name ?? ""
  return (
    <Card size="sm" className="my-3">
      <CardHeader>
        <CardTitle>{name}</CardTitle>
        <CardDescription>{attributes.artifact_kind}</CardDescription>
        <CardAction>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              const composer = runtime.composer
              const prompt = t("common.templateUsePrompt", {
                name,
                skill: attributes.skill_name ?? "",
              })
              if (!composer.text.endsWith(prompt))
                composer.setText(`${composer.text.trimEnd()}\n${prompt}`.trimStart())
            }}
          >
            {t("common.useTemplate")}
          </Button>
        </CardAction>
      </CardHeader>
    </Card>
  )
}
