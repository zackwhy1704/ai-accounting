import { useNavigate } from "react-router-dom"
import { Button } from "../components/ui/button"
import { AlertTriangle } from "lucide-react"

export default function NotFoundPage() {
  const navigate = useNavigate()
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-500/10">
        <AlertTriangle className="h-8 w-8 text-amber-600" />
      </div>
      <div className="text-2xl font-semibold text-foreground">Page Not Found</div>
      <div className="text-sm text-muted-foreground">
        The page you're looking for doesn't exist or has been moved.
      </div>
      <Button
        type="button"
        onClick={() => navigate("/dashboard")}
        className="mt-2 h-9 rounded-xl bg-gradient-to-r from-[#7C9DFF] to-[#4D63FF] px-4 text-sm font-semibold text-white"
      >
        Back to Dashboard
      </Button>
    </div>
  )
}
