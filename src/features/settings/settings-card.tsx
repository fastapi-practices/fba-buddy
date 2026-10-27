import { Children, Fragment, type ReactNode } from "react"

import { Card, CardContent } from "@/components/ui/card"
import { FieldGroup } from "@/components/ui/field"
import { Separator } from "@/components/ui/separator"
import { cn } from "@/lib/utils"

export const SETTINGS_ROW_CLASS =
  "min-h-[var(--app-settings-row-min-height)] px-4 py-[var(--app-settings-row-py)] has-[>[data-slot=field-content]]:not-has-[[data-slot=field-description]]:items-center max-sm:flex-col max-sm:items-stretch max-sm:gap-3"

export function SettingsPageHeader({
  title,
  action,
  titleClassName,
}: {
  title: string
  action?: ReactNode
  titleClassName?: string
}) {
  /* 「设置」大标题移到动态侧边栏后，分节标题升回页面大标题，操作按钮同排靠右 */
  return (
    <header className="flex items-center justify-between gap-4">
      <h1
        className={cn(
          "font-heading text-2xl font-semibold tracking-tight",
          titleClassName
        )}
      >
        {title}
      </h1>
      {action ? (
        <div className="flex shrink-0 items-center gap-2">{action}</div>
      ) : null}
    </header>
  )
}

export function SettingsBlock({
  id,
  title,
  description,
  children,
  className,
}: {
  id?: string
  title?: string
  description?: string
  children: ReactNode
  className?: string
}) {
  return (
    <section
      id={id}
      aria-label={title}
      className={cn("flex flex-col gap-3", className)}
    >
      {title ? (
        <div className="flex flex-col gap-1.5">
          <h2 className="text-sm font-medium text-foreground">{title}</h2>
          {description ? (
            <p className="text-sm text-muted-foreground">{description}</p>
          ) : null}
        </div>
      ) : null}
      {children}
    </section>
  )
}

export function SettingsCard({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  const items = Children.toArray(children)

  return (
    <Card size="sm" className={cn("app-settings-card gap-0 py-0", className)}>
      <CardContent className="p-0">
        <FieldGroup className="gap-0">
          {items.map((item, index) => (
            <Fragment key={index}>
              {index > 0 ? <Separator className="mx-4 !w-auto" /> : null}
              {item}
            </Fragment>
          ))}
        </FieldGroup>
      </CardContent>
    </Card>
  )
}
