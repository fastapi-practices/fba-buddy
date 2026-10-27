"use client"

import type { ReactNode } from "react"
import { ChevronRightIcon, FileIcon, FolderIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { cn } from "@/lib/utils"

export type FileTreeEntry = {
  path: string
  name?: string
  meta?: ReactNode
}

type FileTreeFolder = {
  type: "folder"
  name: string
  path: string
  children: FileTreeNode[]
}

type FileTreeFile = Omit<FileTreeEntry, "name"> & {
  type: "file"
  name: string
}

type FileTreeNode = FileTreeFolder | FileTreeFile

function basename(path: string) {
  return path.split("/").at(-1) || path
}

function buildTree(entries: readonly FileTreeEntry[]): FileTreeNode[] {
  const root: FileTreeFolder = {
    type: "folder",
    name: "",
    path: "",
    children: [],
  }
  for (const entry of entries) {
    const segments = entry.path.split("/").filter(Boolean)
    let parent = root
    segments.forEach((segment, index) => {
      const path = segments.slice(0, index + 1).join("/")
      const last = index === segments.length - 1
      if (last) {
        parent.children.push({
          ...entry,
          type: "file",
          name: entry.name ?? basename(entry.path),
        })
        return
      }
      let folder = parent.children.find(
        (node): node is FileTreeFolder =>
          node.type === "folder" && node.path === path
      )
      if (!folder) {
        folder = { type: "folder", name: segment, path, children: [] }
        parent.children.push(folder)
      }
      parent = folder
    })
  }
  const sort = (nodes: FileTreeNode[]) => {
    nodes.sort((left, right) => {
      if (left.type !== right.type) return left.type === "folder" ? -1 : 1
      return left.name.localeCompare(right.name)
    })
    for (const node of nodes) if (node.type === "folder") sort(node.children)
  }
  sort(root.children)
  return root.children
}

function FileTreeRow({
  node,
  selected,
  onSelect,
}: {
  node: FileTreeNode
  selected?: string | undefined
  onSelect?: ((path: string) => void) | undefined
}) {
  if (node.type === "folder") {
    return (
      <Collapsible defaultOpen>
        <CollapsibleTrigger
          render={
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start font-normal aria-expanded:bg-transparent aria-expanded:hover:bg-muted"
            />
          }
        >
          <ChevronRightIcon className="transition-transform group-data-panel-open/button:rotate-90" />
          <FolderIcon />
          <span className="truncate">{node.name}</span>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="ms-4 flex min-w-0 flex-col">
            {node.children.map((child) => (
              <FileTreeRow
                key={child.path}
                node={child}
                selected={selected}
                onSelect={onSelect}
              />
            ))}
          </div>
        </CollapsibleContent>
      </Collapsible>
    )
  }

  return (
    <div className="flex min-w-0 items-center gap-1">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className={cn(
          "min-w-0 flex-1 justify-start font-normal",
          selected === node.path && "bg-accent text-accent-foreground"
        )}
        aria-current={selected === node.path ? "true" : undefined}
        onClick={() => onSelect?.(node.path)}
      >
        <FileIcon />
        <span className="truncate">{node.name}</span>
      </Button>
      {node.meta ? <span className="shrink-0 pe-2">{node.meta}</span> : null}
    </div>
  )
}

export function FileTree({
  files,
  selected,
  onSelect,
  className,
}: {
  files: readonly FileTreeEntry[]
  selected?: string | undefined
  onSelect?: ((path: string) => void) | undefined
  className?: string
}) {
  const nodes = buildTree(files)
  return (
    <div
      data-slot="file-tree"
      className={cn("flex min-w-0 flex-col text-sm", className)}
    >
      {nodes.map((node) => (
        <FileTreeRow
          key={node.path}
          node={node}
          selected={selected}
          onSelect={onSelect}
        />
      ))}
    </div>
  )
}
