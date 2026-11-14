"use client"

import type React from "react"

import { useState, useEffect, useRef } from "react"
import { Send } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import { Textarea } from "@/components/ui/textarea"

type Agent = "programmer" | "code_reviewer" | "code_executor" | "user" | "err" | "close"

type Message = {
  id: string
  content: string
  agent: Agent
  timestamp: Date
}

export default function ChatInterface() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "1",
      content: "您好！我是 多代理AI輔助python開發系統。請輸入您的任務需求。",
      agent: "err",
      timestamp: new Date(),
    },
  ])
  const [input, setInput] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [isStreaming, setIsStreaming] = useState(false)
  const [streamingMessage, setStreamingMessage] = useState<Message | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const [lastEnterPress, setLastEnterPress] = useState(0)
  const processedChunksRef = useRef<Set<string>>(new Set())
  // const lastAgentMessageRef = useRef<{ agent: Agent; content: string } | null>(null)

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages, streamingMessage])

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) {
      e.preventDefault()
    }

    if (!input.trim() || isLoading || isStreaming) return

    // Add user message to chat
    const userMessage: Message = {
      id: `user-${Date.now()}`,
      content: input,
      agent: "user",
      timestamp: new Date(),
    }
    setMessages((prev) => [...prev, userMessage])
    setInput("")
    setIsLoading(true)

    // 重置追蹤變數
    processedChunksRef.current.clear()
    // lastAgentMessageRef.current = null

    let currentAgent: Agent = "programmer"
    let currentMessageId = `msg-${Date.now()}`
    let currentContent = ""

    try {
      // Call your AutoGen API with streaming
      const response = await fetch("/api/autogen", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ task: input }),
      })

      if (!response.ok) {
        throw new Error(`Failed to get response: ${response.status} ${response.statusText}`)
      }

      if (!response.body) {
        throw new Error("Response body is null")
      }

      // Handle streaming response
      setIsStreaming(true)
      const reader = response.body.getReader()

      setStreamingMessage({
        id: currentMessageId,
        content: currentContent,
        agent: currentAgent,
        timestamp: new Date(),
      })

      while (true) {
        const { done, value } = await reader.read()
        if (done) break;


        // Parse the chunk data
        const chunk = new TextDecoder().decode(value)
        console.log("Received chunk:", chunk) // Debug log

        try {
          // 檢查是否已處理過這個塊
          // if(lastAgentMessageRef.current && lastAgentMessageRef.current.agent === "err")  continue;
          if (processedChunksRef.current.has(chunk)) {
            console.log("Skipping duplicate chunk:", chunk)
            continue
          }

          const data = JSON.parse(chunk)
          // console.log(lastAgentMessageRef.current?.agent, "#Parsed data:", data) // Debug log

          // 標記為已處理
          processedChunksRef.current.add(chunk)

          // 檢查代理是否變更
          if (data.agent && data.agent !== currentAgent) {
            // 完成當前消息
            if (currentContent.trim() !== "") {
              // // 檢查是否與上一條消息重複
              // if (
              //   !lastAgentMessageRef.current ||
              //   lastAgentMessageRef.current.agent !== currentAgent ||
              //   lastAgentMessageRef.current.content !== currentContent
              // ) {
              const newMessage = {
                id: `${currentAgent}-${Date.now()}`,
                content: currentContent,
                agent: currentAgent,
                timestamp: new Date(),
              }

              await setMessages((prev) => [...prev, newMessage])
              //   lastAgentMessageRef.current = {
              //     agent: currentAgent,
              //     content: currentContent,
              //   }
              // }
            }

            // 開始新代理的消息
            currentAgent = data.agent as Agent
            currentMessageId = `${currentAgent}-${Date.now()}`
            currentContent = data.content || ""

            await setStreamingMessage({
              id: currentMessageId,
              content: currentContent,
              agent: currentAgent,
              timestamp: new Date(),
            })
          } else {
            // 更新當前流式消息
            currentContent = data.content || ""
            await setStreamingMessage({
              id: currentMessageId,
              content: currentContent,
              agent: currentAgent,
              timestamp: new Date(),
            })
          }
        } catch (e) {
          console.error("Error parsing chunk:", e)
        }

      }

      // 添加最終流式消息（如果有內容且不重複）
      if (streamingMessage && streamingMessage.content.trim() !== "") {
        // // 檢查是否與上一條消息重複
        // if (
        //   !lastAgentMessageRef.current ||
        //   lastAgentMessageRef.current.agent !== streamingMessage.agent ||
        //   lastAgentMessageRef.current.content !== streamingMessage.content
        // ) {
        const finalMessage = {
          id: `${streamingMessage.agent}-${Date.now()}`,
          content: streamingMessage.content,
          agent: streamingMessage.agent,
          timestamp: new Date(),
        }

        setMessages((prev) => [...prev, finalMessage])
        // }
      }
    } catch (error) {
      console.error("Error:", error)
      currentContent = "" // 清空訊息
      // Handle error - maybe add an error message to the chat
      setMessages((prev) => [
        ...prev,
        {
          id: `error-${Date.now()}`,
          content: `發生錯誤: ${error instanceof Error ? error.message : String(error)}`,
          agent: "programmer",
          timestamp: new Date(),
        },
      ])
    } finally {
      // 如果最後累積的內容不為空，檢查是否與上一筆訊息重複，若不是就新增最終訊息
      if (currentContent.trim() !== "") {
        // if (
        //   !lastAgentMessageRef.current ||
        //   lastAgentMessageRef.current.agent !== currentAgent ||
        //   lastAgentMessageRef.current.content !== currentContent
        // ) {
        const finalMessage = {
          id: `${currentAgent}-${Date.now()}`,
          content: currentContent,
          agent: currentAgent,
          timestamp: new Date(),
        };
        setMessages((prev) => [...prev, finalMessage]);
        // }
      }

      setIsLoading(false)
      setIsStreaming(false)
      setStreamingMessage(null)
    }
  }

  // 處理連續兩下 Enter 鍵發送任務
  const handleKeyDown = async (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      const now = Date.now()
      // 檢查是否在短時間內連續按下 Enter 鍵（500毫秒內）
      if (now - lastEnterPress < 500) {
        e.preventDefault() // 防止換行
        await handleSubmit() // 發送任務
        setLastEnterPress(0) // 重置計時器
      } else {
        setLastEnterPress(now) // 記錄第一次按下 Enter 的時間
      }
    } else {
      // 如果按下的不是 Enter 鍵，重置計時器
      setLastEnterPress(0)
    }
  }

  const getAgentAvatar = (agent: Agent) => {
    switch (agent) {
      case "programmer":
        return { icon: "👨‍💻", label: "程式碼開發代理", textColor: "text-blue-500" }
      case "code_reviewer":
        return { icon: "🔍", label: "測試代理", textColor: "text-purple-500" }
      case "code_executor":
        return { icon: "💻", label: "使用者代理", textColor: "text-green-500" }
      case "user":
        return { icon: "👤", label: "您", textColor: "text-gray-500" }
      default:
        return { icon: "🤖", label: "總代理", textColor: "text-primary" }
    }
  }

  const formatCode = (content: string) => {
    // Replace markdown code blocks with styled divs
    const parts = content.split(/(```[\s\S]*?```)/g)

    return parts.map((part, index) => {
      if (part.startsWith("```") && part.endsWith("```")) {
        const codeContent = part.slice(3, -3)
        const firstLineEnd = codeContent.indexOf("\n")
        const language = firstLineEnd > 0 ? codeContent.slice(0, firstLineEnd).trim() : ""
        const code = firstLineEnd > 0 ? codeContent.slice(firstLineEnd + 1) : codeContent

        return (
          <div key={index} className="my-2 rounded-md overflow-hidden">
            {language && <div className="bg-slate-700 text-slate-200 px-4 py-1 text-xs font-mono">{language}</div>}
            <pre className="bg-slate-800 text-slate-50 p-4 overflow-x-auto">
              <code>{code}</code>
            </pre>
          </div>
        )
      }

      // Handle normal text with line breaks
      return (
        <div key={index} className="whitespace-pre-wrap break-all">
          {part}
        </div>
      )
    })
  }

  // 使用 useMemo 來避免每次渲染時重新生成時間字符串
  const formatTime = (date: Date) => {
    // 使用固定格式而不是 toLocaleTimeString()
    const hours = date.getHours().toString().padStart(2, "0")
    const minutes = date.getMinutes().toString().padStart(2, "0")
    const seconds = date.getSeconds().toString().padStart(2, "0")
    return `${hours}:${minutes}:${seconds}`
  }

  return (
    <div className="flex flex-col h-screen w-full p-4">
      <header className="py-4 border-b">
        <h1 className="text-2xl font-bold text-center">多代理AI輔助python開發系統</h1>
      </header>

      <div className="flex-1 overflow-y-auto py-4 space-y-4 hide-scrollbar">
        {messages.map((message) => (
          <div
            key={message.id}
            className={cn("flex items-start gap-3 p-4", message.agent === "user" ? "justify-end" : "justify-start")}
          >
            {message.agent !== "user" && (
              <div className="h-14 w-14 flex-shrink-0 flex items-center justify-center">
                <span className="text-4xl">{getAgentAvatar(message.agent).icon}</span>
              </div>
            )}
            <Card
              className={cn(
                "p-3 max-w-[90%] overflow-hidden",
                message.agent === "user"
                  ? "bg-primary text-primary-foreground"
                  : message.agent === "programmer"
                    ? "bg-blue-50 dark:bg-blue-900/20"
                    : message.agent === "code_reviewer"
                      ? "bg-purple-50 dark:bg-purple-900/20"
                      : "bg-green-50 dark:bg-green-900/20",
              )}
            >
              <div className={cn("text-xs font-semibold mb-1", getAgentAvatar(message.agent).textColor)}>
                {getAgentAvatar(message.agent).label}
              </div>
              <div className="break-words overflow-hidden">{formatCode(message.content)}</div>
              <div
                className={cn(
                  "text-xs mt-2",
                  message.agent === "user" ? "text-primary-foreground/70" : "text-muted-foreground",
                )}
              >
                {formatTime(message.timestamp)}
              </div>
            </Card>
            {message.agent === "user" && (
              <div className="h-14 w-14 flex-shrink-0 flex items-center justify-center">
                <span className="text-4xl">{getAgentAvatar(message.agent).icon}</span>
              </div>
            )}
          </div>
        ))}

        {streamingMessage && streamingMessage.content.trim() !== "" && (
          <div key="streaming-message" className="flex items-start gap-3 p-4">
            <div className="h-14 w-14 flex-shrink-0 flex items-center justify-center">
              <span className="text-4xl">{getAgentAvatar(streamingMessage.agent).icon}</span>
            </div>
            <Card
              className={cn(
                "p-3 max-w-[90%] overflow-hidden",
                streamingMessage.agent === "programmer"
                  ? "bg-blue-50 dark:bg-blue-900/20"
                  : streamingMessage.agent === "code_reviewer"
                    ? "bg-purple-50 dark:bg-purple-900/20"
                    : streamingMessage.agent === "code_executor"
                      ? "bg-green-50 dark:bg-green-900/20"
                      : "bg-muted",
              )}
            >
              <div className={cn("text-xs font-semibold mb-1", getAgentAvatar(streamingMessage.agent).textColor)}>
                {getAgentAvatar(streamingMessage.agent).label}
              </div>
              <div className="break-words overflow-hidden">{formatCode(streamingMessage.content)}</div>
              <div className="text-xs mt-2 text-muted-foreground">{formatTime(streamingMessage.timestamp)}</div>
            </Card>
          </div>
        )}

        {isLoading && !isStreaming && (
          <div className="flex items-start gap-3 p-4">
            <div className="h-14 w-14 flex-shrink-0 flex items-center justify-center">
              <span className="text-4xl">👨‍💻</span>
            </div>
            <Card className="p-3 max-w-[90%] bg-blue-50 dark:bg-blue-900/20">
              <div className="flex space-x-2">
                <div className="h-2 w-2 bg-current rounded-full animate-bounce [animation-delay:-0.3s]"></div>
                <div className="h-2 w-2 bg-current rounded-full animate-bounce [animation-delay:-0.15s]"></div>
                <div className="h-2 w-2 bg-current rounded-full animate-bounce"></div>
              </div>
            </Card>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <form onSubmit={handleSubmit} className="pt-4 border-t">
        <div className="flex flex-col gap-2">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="請輸入您的任務需求... (連續按兩下 Enter 鍵發送)"
            className="flex-1 min-h-[100px]"
            disabled={isLoading || isStreaming}
          />
          <Button type="submit" className="ml-auto" disabled={isLoading || isStreaming || !input.trim()}>
            {isLoading || isStreaming ? "處理中..." : "發送任務"}
            {!isLoading && !isStreaming && <Send className="ml-2 h-4 w-4" />}
          </Button>
        </div>
      </form>
    </div>
  )
}

