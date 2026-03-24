import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Bot, Send, Sparkles, TrendingUp, FileText, Search, Lightbulb } from 'lucide-react'

const suggestedQueries = [
  { icon: TrendingUp, text: 'What was our net income this quarter?' },
  { icon: FileText, text: 'Show me all overdue invoices' },
  { icon: Search, text: 'Which vendor did we spend the most on?' },
  { icon: Lightbulb, text: 'Suggest ways to reduce expenses' },
]

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
}

const demoMessages: Message[] = [
  { id: '1', role: 'user', content: 'What is our current cash position?', timestamp: new Date('2026-03-24T10:00:00') },
  { id: '2', role: 'assistant', content: 'Your current cash position is **$85,400 SGD** in your primary bank account (DBS Current Account 1000).\n\nBreakdown:\n- Cash at Bank: $85,400\n- Accounts Receivable: $21,800\n- Accounts Payable: -$8,770\n\n**Net Working Capital: $98,430**\n\nBased on your average monthly expenses of $38,000, you have approximately **2.2 months of runway** at current burn rate. Your cash position has improved 12% compared to last month.', timestamp: new Date('2026-03-24T10:00:05') },
]

export function AIAssistantPage() {
  const [messages, setMessages] = useState<Message[]>(demoMessages)
  const [input, setInput] = useState('')

  const handleSend = () => {
    if (!input.trim()) return
    const userMsg: Message = { id: Date.now().toString(), role: 'user', content: input, timestamp: new Date() }
    setMessages([...messages, userMsg])
    setInput('')

    // Simulate AI response
    setTimeout(() => {
      const aiMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: "I'm analyzing your financial data to answer that question. In production, this would connect to your actual accounting data via the FastAPI backend and use Claude to generate insights.\n\nThis feature uses the **Claude Agent SDK** with tool-use to query your PostgreSQL database and generate natural language responses.",
        timestamp: new Date(),
      }
      setMessages((prev) => [...prev, aiMsg])
    }, 1500)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Bot className="h-6 w-6 text-primary" /> AI Assistant
          </h1>
          <p className="text-muted-foreground">Ask questions about your finances in natural language</p>
        </div>
        <Badge variant="default" className="gap-1"><Sparkles className="h-3 w-3" /> Powered by Claude</Badge>
      </div>

      <div className="grid gap-6 lg:grid-cols-4">
        {/* Chat area */}
        <Card className="lg:col-span-3 flex flex-col" style={{ height: 'calc(100vh - 220px)' }}>
          <CardContent className="flex-1 overflow-y-auto p-6 space-y-4">
            {messages.map((msg) => (
              <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[80%] rounded-lg p-4 ${msg.role === 'user' ? 'bg-primary text-white' : 'bg-muted'}`}>
                  {msg.role === 'assistant' && (
                    <div className="flex items-center gap-2 mb-2">
                      <Bot className="h-4 w-4 text-primary" />
                      <span className="text-xs font-medium text-primary">AI Assistant</span>
                    </div>
                  )}
                  <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                  <p className={`text-xs mt-2 ${msg.role === 'user' ? 'text-white/70' : 'text-muted-foreground'}`}>
                    {msg.timestamp.toLocaleTimeString()}
                  </p>
                </div>
              </div>
            ))}
          </CardContent>

          <div className="border-t border-border p-4">
            <div className="flex gap-2">
              <Input
                placeholder="Ask about your finances..."
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                className="flex-1"
              />
              <Button onClick={handleSend}><Send className="h-4 w-4" /></Button>
            </div>
          </div>
        </Card>

        {/* Suggested queries */}
        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Suggested Questions</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {suggestedQueries.map((q) => (
                <button
                  key={q.text}
                  onClick={() => setInput(q.text)}
                  className="flex w-full items-start gap-2 rounded-lg border border-border p-3 text-left text-sm hover:bg-muted transition-colors"
                >
                  <q.icon className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                  {q.text}
                </button>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">AI Capabilities</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-xs text-muted-foreground">
              <p>The AI assistant can:</p>
              <ul className="list-disc pl-4 space-y-1">
                <li>Query your financial data</li>
                <li>Generate custom reports</li>
                <li>Categorize transactions</li>
                <li>Forecast cash flow</li>
                <li>Identify anomalies</li>
                <li>Suggest tax deductions</li>
              </ul>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
