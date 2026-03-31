import { Component, type ReactNode } from "react"

interface Props { children: ReactNode }
interface State { error: Error | null }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex flex-col items-center justify-center min-h-[400px] gap-4 text-center p-8">
          <div className="text-lg font-semibold text-foreground">Something went wrong</div>
          <div className="text-sm text-muted-foreground max-w-md font-mono bg-muted p-3 rounded-lg text-left">
            {this.state.error.message}
          </div>
          <button
            className="mt-2 rounded-xl bg-gradient-to-r from-[#7C9DFF] to-[#4D63FF] px-4 py-2 text-sm font-semibold text-white"
            onClick={() => this.setState({ error: null })}
          >
            Try again
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
