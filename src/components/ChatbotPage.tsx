'use client'

import React, { useState, useRef, useEffect, useCallback } from "react";
import { useAuth } from "../contexts/AuthContext";
import { supabase } from "../lib/supabase";
import { Menu, X, Plus, Trash2 } from "lucide-react";

type ChatMessage = { id?: number; role: "user" | "assistant" | "system"; content: string };

interface ChatSession {
  id: string;
  title: string | null;
  last_message: string | null;
  updated_at: string;
}

const ChatbotPage: React.FC = () => {
  const { session, signOut } = useAuth();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState<string>("");
  const [sending, setSending] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const functionUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/chat`;

  // Create new session
  const createNewSession = useCallback(async () => {
    if (!session) return null;
    
    try {
      const { data, error } = await supabase
        .from("chat_sessions")
        .insert({ user_id: session.user.id })
        .select("id, title, updated_at")
        .single();

      if (error) throw error;

      const newSession = {
        id: data.id,
        title: data.title,
        last_message: null,
        updated_at: data.updated_at
      };

      setSessions(prev => [newSession, ...prev]);
      setActiveSessionId(data.id);
      setMessages([]);
      return data.id;
    } catch (error) {
      console.error("Error creating session:", error);
      return null;
    }
  }, [session]);

  // Load sessions
  const loadSessions = useCallback(async () => {
    if (!session) return;
    
    try {
      const { data, error } = await supabase
        .from("chat_sessions")
        .select("id, title, updated_at")
        .eq("user_id", session.user.id)
        .order("updated_at", { ascending: false })
        .limit(20);

      if (error) throw error;

      // Fetch latest message preview
      const ids = (data || []).map((d) => d.id);
      const latestBySession = new Map<string, string>();
      
      if (ids.length > 0) {
        const { data: msgs } = await supabase
          .from("chat_messages")
          .select("session_id, content, created_at")
          .in("session_id", ids)
          .order("created_at", { ascending: false });
        
        (msgs || []).forEach((m) => {
          if (!latestBySession.has(m.session_id)) {
            latestBySession.set(m.session_id, m.content);
          }
        });
      }

      const sessionsWithMessages = (data || []).map((d) => ({
        id: d.id,
        title: d.title,
        updated_at: d.updated_at,
        last_message: latestBySession.get(d.id) || null
      }));

      setSessions(sessionsWithMessages);
      
      if (sessionsWithMessages.length === 0) {
        await createNewSession();
      } else {
        setActiveSessionId(sessionsWithMessages[0].id);
      }
    } catch (error) {
      console.error("Error loading sessions:", error);
    } finally {
      setLoading(false);
    }
  }, [session, createNewSession]);

  // Load messages for a session
  const loadMessages = useCallback(async (sessionId: string) => {
    try {
      const { data, error } = await supabase
        .from("chat_messages")
        .select("id, role, content")
        .eq("session_id", sessionId)
        .order("id", { ascending: true });

      if (error) throw error;
      setMessages(data || []);
    } catch (error) {
      console.error("Error loading messages:", error);
    }
  }, []);

  // Send message
  const sendMessage = async () => {
    if (!session?.access_token || !input.trim() || sending || !activeSessionId) return;

    const userText = input.trim();
    setInput("");
    setSending(true);

    // Add user message
    const userMessage: ChatMessage = { role: "user", content: userText };
    setMessages(prev => [...prev, userMessage]);

    try {
      const res = await fetch(functionUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ message: userText, sessionId: activeSessionId }),
      });

      if (!res.ok) throw new Error("Failed to send message");

      const contentType = res.headers.get("Content-Type") || "";
      
      if (contentType.includes("application/json")) {
        const json = await res.json();
        const content = json?.content || "";
        if (content) {
          setMessages(prev => [...prev, { role: "assistant", content }]);
        }
      } else if (res.body) {
        // Handle streaming response
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let assistantStarted = false;
        let buffer = "";

        try {
          while (true) {
            const { value, done } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value, { stream: true });
            buffer += chunk;
            const lines = buffer.split(/\r?\n/);
            buffer = lines.pop() || "";

            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed.startsWith("data:")) continue;
              
              const payload = trimmed.replace(/^data:\s*/, "");
              if (payload === "[DONE]") continue;

              try {
                const json = JSON.parse(payload);
                const delta = json?.choices?.[0]?.delta?.content || json?.choices?.[0]?.message?.content || "";
                
                if (!assistantStarted) {
                  assistantStarted = true;
                  setMessages(prev => [...prev, { role: "assistant", content: "" }]);
                }

                if (delta) {
                  setMessages(prev => {
                    const copy = [...prev];
                    const last = copy[copy.length - 1];
                    if (last && last.role === "assistant") {
                      last.content += delta;
                    }
                    return copy;
                  });
                }
              } catch {
                // Ignore parsing errors
              }
            }
          }
        } finally {
          reader.releaseLock();
        }
      }
    } catch (error) {
      console.error("Error sending message:", error);
      setMessages(prev => [...prev, { role: "assistant", content: "Sorry, I encountered an error. Please try again." }]);
    } finally {
      setSending(false);
    }
  };

  // Delete session
  const deleteSession = async (sessionId: string) => {
    try {
      await supabase.from("chat_sessions").delete().eq("id", sessionId);
      setSessions(prev => prev.filter(s => s.id !== sessionId));
      
      if (activeSessionId === sessionId) {
        const remainingSessions = sessions.filter(s => s.id !== sessionId);
        if (remainingSessions.length > 0) {
          setActiveSessionId(remainingSessions[0].id);
        } else {
          await createNewSession();
        }
      }
    } catch (error) {
      console.error("Error deleting session:", error);
    }
  };

  // Effects
  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  useEffect(() => {
    if (activeSessionId) {
      loadMessages(activeSessionId);
    }
  }, [activeSessionId, loadMessages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (!session?.user?.id) return;

    const userId = session.user.id;

    // Listen for session changes from extension
    const sessionsChannel = supabase
      .channel('webapp-sessions')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'chat_sessions',
        filter: `user_id=eq.${userId}`
      }, (payload) => {
        console.log('Session change detected from extension:', payload);
        
        if (payload.eventType === 'INSERT') {
          // Add new session from extension
          const newSession = {
            id: payload.new.id,
            title: payload.new.title,
            last_message: null,
            updated_at: payload.new.updated_at
          };
          setSessions(prev => {
            // Avoid duplicates
            if (prev.find(s => s.id === newSession.id)) return prev;
            return [newSession, ...prev];
          });
        } else if (payload.eventType === 'UPDATE') {
          // Update existing session
          setSessions(prev => prev.map(s => 
            s.id === payload.new.id 
              ? { ...s, title: payload.new.title, updated_at: payload.new.updated_at }
              : s
          ));
        } else if (payload.eventType === 'DELETE') {
          // Remove deleted session
          setSessions(prev => prev.filter(s => s.id !== payload.old.id));
          if (activeSessionId === payload.old.id) {
            setActiveSessionId(null);
            setMessages([]);
          }
        }
      })
      .subscribe();

    // Listen for message changes from extension
    const messagesChannel = supabase
      .channel('webapp-messages')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'chat_messages',
        filter: `user_id=eq.${userId}`
      }, (payload) => {
        console.log('Message change detected from extension:', payload);
        
        if (payload.eventType === 'INSERT') {
          // Add new message if it's for the active session
          if (payload.new.session_id === activeSessionId) {
            const newMessage = {
              id: payload.new.id,
              role: payload.new.role as "user" | "assistant",
              content: payload.new.content
            };
            setMessages(prev => {
              // Avoid duplicates
              if (prev.find(m => m.id === newMessage.id)) return prev;
              return [...prev, newMessage];
            });
          }
        }
      })
      .subscribe();

    // Cleanup function
    return () => {
      supabase.removeChannel(sessionsChannel);
      supabase.removeChannel(messagesChannel);
    };
  }, [session?.user?.id, activeSessionId]);

  useEffect(() => {
    const handleExtensionMessage = (event: MessageEvent) => {
      if (event.data?.type === 'DATABASE_SYNC' && event.data?.source === 'extension-realtime') {
        console.log('Received sync message from extension:', event.data);
        
        // Handle session sync
        if (event.data.table === 'chat_sessions') {
          if (event.data.event === 'INSERT') {
            const newSession = {
              id: event.data.data.id,
              title: event.data.data.title,
              last_message: null,
              updated_at: event.data.data.updated_at
            };
            setSessions(prev => {
              if (prev.find(s => s.id === newSession.id)) return prev;
              return [newSession, ...prev];
            });
          }
        }
        
        // Handle message sync
        if (event.data.table === 'chat_messages' && event.data.data.session_id === activeSessionId) {
          if (event.data.event === 'INSERT') {
            const newMessage = {
              id: event.data.data.id,
              role: event.data.data.role as "user" | "assistant",
              content: event.data.data.content
            };
            setMessages(prev => {
              if (prev.find(m => m.id === newMessage.id)) return prev;
              return [...prev, newMessage];
            });
          }
        }
      }
    };

    window.addEventListener('message', handleExtensionMessage);
    return () => window.removeEventListener('message', handleExtensionMessage);
  }, [activeSessionId]);

  if (loading) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-gray-900">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div className="w-full h-full bg-gray-900 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-3 bg-gray-800 border-b border-gray-700">
        <div className="flex items-center space-x-3">
          <button
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            className="p-1 text-gray-400 hover:text-white transition-colors"
          >
            {isMenuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
          <h1 className="text-white font-medium text-sm">ChatBot</h1>
        </div>
        
        <div className="flex items-center space-x-2">
          <button
            onClick={createNewSession}
            className="p-1 text-gray-400 hover:text-white transition-colors"
            title="New Chat"
          >
            <Plus size={18} />
          </button>
          <button
            onClick={signOut}
            className="text-xs text-gray-400 hover:text-white transition-colors"
          >
            Sign Out
          </button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        {isMenuOpen && (
          <div className="w-48 bg-gray-800 border-r border-gray-700 overflow-y-auto">
            <div className="p-3">
              <h3 className="text-white font-medium text-sm mb-3">Conversations</h3>
              <div className="space-y-1">
                {sessions.map((session) => (
                  <div
                    key={session.id}
                    className={`flex items-center justify-between p-2 rounded cursor-pointer transition-colors ${
                      activeSessionId === session.id
                        ? "bg-blue-600 text-white"
                        : "text-gray-300 hover:bg-gray-700"
                    }`}
                    onClick={() => setActiveSessionId(session.id)}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium truncate">
                        {session.title || session.last_message || "New chat"}
                      </div>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteSession(session.id);
                      }}
                      className="p-1 text-gray-400 hover:text-red-400 transition-colors"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Chat Area */}
        <div className="flex-1 flex flex-col">
          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-3 space-y-3">
            {messages.length === 0 ? (
              <div className="text-center text-gray-400 text-sm mt-8">
                Start a conversation...
              </div>
            ) : (
              messages.map((message, index) => (
                <div
                  key={`${message.id || 'msg'}-${index}-${message.role}`}
                  className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${
                      message.role === "user"
                        ? "bg-blue-600 text-white"
                        : "bg-gray-700 text-gray-200"
                    }`}
                  >
                    {message.content}
                  </div>
                </div>
              ))
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="p-3 border-t border-gray-700">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                sendMessage();
              }}
              className="flex space-x-2"
            >
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Type your message..."
                disabled={sending || !activeSessionId}
                className="flex-1 px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
              />
              <button
                type="submit"
                disabled={sending || !input.trim() || !activeSessionId}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 text-white rounded-md transition-colors duration-200 disabled:cursor-not-allowed text-sm"
              >
                {sending ? "..." : "Send"}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ChatbotPage;
