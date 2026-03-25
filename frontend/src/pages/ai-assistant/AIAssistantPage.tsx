import { useState } from "react"
import { Bot, Send } from "lucide-react"
import { useTheme } from "../../lib/theme"
import { Card } from "../../components/ui/card"
import { Button } from "../../components/ui/button"
import { Input } from "../../components/ui/input"

export default function AIAssistantPage() {
  const { t } = useTheme()
  const [messages, setMessages] = useState<{ role: string; content: string }[]>([
    { role: "assistant", content: t("ai.greeting") },
  ])
  const [input, setInput] = useState("")

  const handleSend = () => {
    if (!input.trim()) return
    setMessages(prev => [...prev, { role: "user", content: input }, { role: "assistant", content: t("ai.previewMode") }])
    setInput("")
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="text-xs text-muted-foreground">{t("ai.category")}</div>
        <div className="mt-1 text-2xl font-semibold tracking-tight text-foreground">{t("ai.title")}</div>
        <div className="mt-1 max-w-2xl text-sm text-muted-foreground">{t("ai.desc")}</div>
      </div>

      <Card className="flex h-[calc(100vh-250px)] flex-col rounded-2xl border-border bg-card shadow-[0_0_0_1px_rgba(15,23,42,0.06),0_18px_55px_rgba(2,6,23,0.08)]">
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.map((m, i) => (
            <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm ${m.role === "user" ? "bg-gradient-to-r from-[#7C9DFF] to-[#4D63FF] text-white" : "bg-muted text-foreground"}`}>
                {m.role === "assistant" && (<div className="flex items-center gap-2 mb-1"><Bot className="h-3.5 w-3.5" /><span className="text-xs font-semibold">{t("ai.title")}</span></div>)}
                {m.content}
              </div>
            </div>
          ))}
        </div>
        <div className="border-t border-border p-4">
          <div className="flex gap-2">
            <Input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === "Enter" && handleSend()} placeholder={t("ai.placeholder")} className="h-10 rounded-xl text-sm" />
            <Button onClick={handleSend} className="h-10 rounded-xl bg-gradient-to-r from-[#7C9DFF] to-[#4D63FF] px-4 text-white"><Send className="h-4 w-4" /></Button>
          </div>
        </div>
      </Card>
    </div>
  )
}
