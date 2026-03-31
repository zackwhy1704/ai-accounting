import { useState, useRef, useEffect } from "react"
import { Bot, Send, Loader2, Sparkles } from "lucide-react"
import { useTheme } from "../../lib/theme"
import { Card } from "../../components/ui/card"
import { Button } from "../../components/ui/button"
import { Input } from "../../components/ui/input"
import api from "../../lib/api"

interface Message {
  role: "user" | "assistant"
  content: string
}

const SUGGESTIONS = [
  "What is SST and how does it apply to my business?",
  "How do I record a bank transfer in double-entry bookkeeping?",
  "What documents do I need for MyInvois LHDN submission?",
  "Explain the difference between credit notes and debit notes",
]

export default function AIAssistantPage() {
  const { t } = useTheme()
  const [messages, setMessages] = useState<Message[]>([
    { role: "assistant", content: "Hello! I'm your AI accounting assistant. I can help with accounting questions, Malaysia SST/MyInvois compliance, Singapore GST, and more. How can I help you today?" },
  ])
  const [input, setInput] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  const handleSend = async (text?: string) => {
    const content = (text ?? input).trim()
    if (!content || isLoading) return

    const userMsg: Message = { role: "user", content }
    setMessages(prev => [...prev, userMsg])
    setInput("")
    setIsLoading(true)

    try {
      const allMessages = [...messages, userMsg]
      const { data } = await api.post("/ai/chat", { messages: allMessages })
      setMessages(prev => [...prev, { role: "assistant", content: data.reply }])
    } catch {
      setMessages(prev => [...prev, { role: "assistant", content: "Sorry, I'm having trouble connecting. Please try again." }])
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="text-xs text-muted-foreground">{t("ai.category")}</div>
        <div className="mt-1 text-2xl font-semibold tracking-tight text-foreground">{t("ai.title")}</div>
        <div className="mt-1 max-w-2xl text-sm text-muted-foreground">{t("ai.desc")}</div>
      </div>

      {messages.length === 1 && (
        <div className="grid grid-cols-2 gap-2">
          {SUGGESTIONS.map(s => (
            <button key={s} type="button" onClick={() => handleSend(s)}
              className="flex items-start gap-2 rounded-xl border border-border bg-card p-3 text-left text-xs text-muted-foreground hover:bg-muted/40 transition-colors">
              <Sparkles className="h-3.5 w-3.5 mt-0.5 shrink-0 text-primary" />
              {s}
            </button>
          ))}
        </div>
      )}

      <Card className="flex h-[calc(100vh-300px)] flex-col rounded-2xl border-border bg-card shadow-[0_0_0_1px_rgba(15,23,42,0.06),0_18px_55px_rgba(2,6,23,0.08)]">
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.map((m, i) => (
            <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm ${m.role === "user" ? "bg-gradient-to-r from-[#7C9DFF] to-[#4D63FF] text-white" : "bg-muted text-foreground"}`}>
                {m.role === "assistant" && (
                  <div className="flex items-center gap-2 mb-1">
                    <Bot className="h-3.5 w-3.5" />
                    <span className="text-xs font-semibold">{t("ai.title")}</span>
                  </div>
                )}
                <div className="whitespace-pre-wrap">{m.content}</div>
              </div>
            </div>
          ))}
          {isLoading && (
            <div className="flex justify-start">
              <div className="rounded-2xl bg-muted px-4 py-3 text-sm text-muted-foreground flex items-center gap-2">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Thinking...
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>
        <div className="border-t border-border p-4">
          <div className="flex gap-2">
            <Input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && !e.shiftKey && handleSend()}
              placeholder={t("ai.placeholder")}
              className="h-10 rounded-xl text-sm"
              disabled={isLoading}
            />
            <Button
              onClick={() => handleSend()}
              disabled={isLoading || !input.trim()}
              className="h-10 rounded-xl bg-gradient-to-r from-[#7C9DFF] to-[#4D63FF] px-4 text-white"
            >
              {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      </Card>
    </div>
  )
}
