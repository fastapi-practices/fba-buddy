import { Component, type ErrorInfo, type ReactNode } from "react"

import { Button } from "@/components/ui/button"
import { translate } from "@/lib/i18n"
import { getLocale } from "@/lib/runtime"

type Props = {
  children: ReactNode
}

type State = {
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(error, info.componentStack)
  }

  render() {
    if (!this.state.error) {
      return this.props.children
    }

    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 bg-background p-8 text-center text-foreground">
        <p className="text-sm text-muted-foreground">
          {translate(getLocale(), "common.workspaceFailedToLoad")}
        </p>
        <p className="max-w-md text-xs text-muted-foreground">
          {this.state.error.message}
        </p>
        <Button type="button" onClick={() => this.setState({ error: null })}>
          {translate(getLocale(), "common.retry")}
        </Button>
      </div>
    )
  }
}
