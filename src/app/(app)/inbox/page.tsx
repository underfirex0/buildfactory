"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { PageHeader } from "@/components/layout/Header";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { supabase } from "@/lib/supabase";
import {
  MessageCircle, Send, RefreshCw, User, Bot,
  Zap, Flame, Snowflake, Calendar, AlertCircle,
  PhoneCall, Search, ChevronRight,
} from "lucide-react";
import toast from "react-hot-toast";

const WA_SERVER = process.env.NEXT_PUBLIC_WA_SERVER_URL || "http://136.117.247.136:3001";
const WA_KEY = process.env.NEXT_PUBLIC_WA_API_KEY || "buildfactory-secret-key";

type ConvStatus = "open" | "hot" | "warm" | "cold" | "booked" | "human_takeover";

interface Message {
  id: string;
  phone: string;
  lead_name: string | null;
  role: "user" | "assistant";
  message: string;
  is_bot: boolean;
  status: ConvStatus;
  created_at: string;
}

interface Conversation {
  phone: string;
  lead_name: string | null;
  last_message: string;
  last_role: "user" | "assistant";
  status: ConvStatus;
  last_at: string;
  unread: boolean;
}

const statusConfig: Record<ConvStatus, { label: string; color: string; bg: string; icon: any }> = {
  hot:            { label: "Hot",           color: "text-red-600",    bg: "bg-red-50 border-red-200",    icon: Flame },
  warm:           { label: "Warm",          color: "text-amber-600",  bg: "bg-amber-50 border-amber-200", icon: Zap },
  open:           { label: "Open",          color: "text-blue-600",   bg: "bg-blue-50 border-blue-200",  icon: MessageCircle },
  cold:           { label: "Cold",          color: "text-slate-500",  bg: "bg-slate-50 border-slate-200", icon: Snowflake },
  booked:         { label: "Booked",        color: "text-green-600",  bg: "bg-green-50 border-green-200", icon: Calendar },
  human_takeover: { label: "You're On",     color: "text-purple-600", bg: "bg-purple-50 border-purple-200", icon: User },
};

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function InboxPage() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [replyText, setReplyText] = useState("");
  const [sending, setSending] = useState(false);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<ConvStatus | "all">("all");
  const [humanPhones, setHumanPhones] = useState<Set<string>>(new Set());
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const pollRef = useRef<NodeJS.Timeout | null>(null);

  // ─── Fetch conversations ──────────────────────────────────────────────────
  const fetchConversations = useCallback(async () => {
    const { data } = await supabase
      .from("bot_conversations")
      .select("*")
      .order("created_at", { ascending: false });

    if (!data) return;

    // Group by phone — get latest message per phone
    const map = new Map<string, Conversation>();
    for (const msg of data) {
      if (!map.has(msg.phone)) {
        map.set(msg.phone, {
          phone: msg.phone,
          lead_name: msg.lead_name,
          last_message: msg.message,
          last_role: msg.role,
          status: msg.status,
          last_at: msg.created_at,
          unread: msg.role === "user",
        });
      }
    }

    setConversations(Array.from(map.values()).sort(
      (a, b) => new Date(b.last_at).getTime() - new Date(a.last_at).getTime()
    ));
    setLoading(false);
  }, []);

  // ─── Fetch messages for selected phone ───────────────────────────────────
  const fetchMessages = useCallback(async (phone: string) => {
    const { data } = await supabase
      .from("bot_conversations")
      .select("*")
      .eq("phone", phone)
      .order("created_at", { ascending: true });
    if (data) setMessages(data);
  }, []);

  // ─── Fetch human takeover phones ────────────────────────────────────────
  const fetchHumanPhones = useCallback(async () => {
    try {
      const sep = "?";
      const res = await fetch(`${WA_SERVER}/bot/takeover${sep}key=${WA_KEY}`);
      const data = await res.json();
      setHumanPhones(new Set(data.phones || []));
    } catch { }
  }, []);

  useEffect(() => {
    fetchConversations();
    fetchHumanPhones();
    pollRef.current = setInterval(() => {
      fetchConversations();
      if (selected) fetchMessages(selected);
    }, 5000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [fetchConversations, fetchMessages, fetchHumanPhones, selected]);

  useEffect(() => {
    if (selected) fetchMessages(selected);
  }, [selected, fetchMessages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // ─── Send manual reply ────────────────────────────────────────────────────
  const handleReply = async () => {
    if (!replyText.trim() || !selected) return;
    setSending(true);
    try {
      const res = await fetch(`${WA_SERVER}/bot/reply?key=${WA_KEY}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: selected, message: replyText }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success("Message sent!");
        setReplyText("");
        fetchMessages(selected);
        fetchConversations();
      } else {
        toast.error(data.error || "Failed to send");
      }
    } catch {
      toast.error("Server error");
    }
    setSending(false);
  };

  // ─── Toggle bot/human ─────────────────────────────────────────────────────
  const toggleTakeover = async (phone: string, enable: boolean) => {
    try {
      await fetch(`${WA_SERVER}/bot/takeover?key=${WA_KEY}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, enable }),
      });
      setHumanPhones(prev => {
        const next = new Set(prev);
        enable ? next.add(phone) : next.delete(phone);
        return next;
      });
      toast.success(enable ? "You're now handling this conversation" : "Bot re-enabled");
    } catch {
      toast.error("Failed to toggle");
    }
  };

  // ─── Update status ────────────────────────────────────────────────────────
  const updateStatus = async (phone: string, newStatus: ConvStatus) => {
    await supabase
      .from("bot_conversations")
      .update({ status: newStatus })
      .eq("phone", phone);
    fetchConversations();
    if (selected === phone) fetchMessages(phone);
    toast.success(`Status updated to ${newStatus}`);
  };

  // ─── Filtered conversations ───────────────────────────────────────────────
  const filtered = conversations.filter(c => {
    const matchSearch = !search ||
      c.phone.includes(search) ||
      (c.lead_name?.toLowerCase().includes(search.toLowerCase()) ?? false);
    const matchFilter = filter === "all" || c.status === filter;
    return matchSearch && matchFilter;
  });

  // ─── Stats ────────────────────────────────────────────────────────────────
  const stats = {
    total: conversations.length,
    hot: conversations.filter(c => c.status === "hot").length,
    booked: conversations.filter(c => c.status === "booked").length,
    human: conversations.filter(c => c.status === "human_takeover").length,
  };

  const selectedConv = conversations.find(c => c.phone === selected);
  const isHuman = selected ? humanPhones.has(selected) : false;

  return (
    <div className="animate-fade-in h-full">
      <PageHeader
        title="Inbox"
        description="AI-powered WhatsApp conversation management"
        actions={
          <Button variant="secondary" size="sm" icon={<RefreshCw className="w-3.5 h-3.5" />} onClick={() => { fetchConversations(); if (selected) fetchMessages(selected); }}>
            Refresh
          </Button>
        }
      />

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        {[
          { label: "Total Chats", value: stats.total, icon: MessageCircle, color: "text-blue-600", bg: "bg-blue-50" },
          { label: "Hot Leads 🔥", value: stats.hot, icon: Flame, color: "text-red-600", bg: "bg-red-50" },
          { label: "Booked", value: stats.booked, icon: Calendar, color: "text-green-600", bg: "bg-green-50" },
          { label: "Need You", value: stats.human, icon: User, color: "text-purple-600", bg: "bg-purple-50" },
        ].map(stat => (
          <Card key={stat.label} padding="md">
            <div className={`w-8 h-8 rounded-lg ${stat.bg} flex items-center justify-center mb-3`}>
              <stat.icon className={`w-4 h-4 ${stat.color}`} />
            </div>
            <p className="text-xl font-bold text-slate-900">{stat.value}</p>
            <p className="text-xs text-slate-500 mt-0.5">{stat.label}</p>
          </Card>
        ))}
      </div>

      {/* Main Layout */}
      <div className="flex gap-4 h-[600px]">

        {/* Left — Conversation List */}
        <Card padding="none" className="w-80 flex-shrink-0 flex flex-col">
          {/* Search + Filter */}
          <div className="p-3 border-b border-surface-100">
            <div className="relative mb-2">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
              <input
                type="text"
                placeholder="Search..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full h-8 pl-9 pr-3 text-xs bg-surface-50 border border-surface-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
            <div className="flex gap-1 flex-wrap">
              {(["all", "hot", "warm", "open", "cold", "booked", "human_takeover"] as const).map(f => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`text-[10px] px-2 py-1 rounded-full font-medium transition-all ${filter === f ? "bg-brand-600 text-white" : "bg-surface-100 text-slate-500 hover:bg-surface-200"}`}
                >
                  {f === "all" ? "All" : f === "human_takeover" ? "You" : f.charAt(0).toUpperCase() + f.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="p-4 text-center text-xs text-slate-400">Loading...</div>
            ) : filtered.length === 0 ? (
              <div className="p-4 text-center text-xs text-slate-400">No conversations yet</div>
            ) : (
              filtered.map(conv => {
                const cfg = statusConfig[conv.status];
                const StatusIcon = cfg.icon;
                const isSelected = selected === conv.phone;
                return (
                  <button
                    key={conv.phone}
                    onClick={() => setSelected(conv.phone)}
                    className={`w-full p-3 text-left border-b border-surface-50 hover:bg-surface-50 transition-colors ${isSelected ? "bg-brand-50 border-l-2 border-l-brand-600" : ""}`}
                  >
                    <div className="flex items-start gap-2.5">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${cfg.bg} border ${cfg.color}`}>
                        <StatusIcon className="w-4 h-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-1">
                          <p className="text-xs font-semibold text-slate-800 truncate">
                            {conv.lead_name || conv.phone}
                          </p>
                          <span className="text-[10px] text-slate-400 flex-shrink-0">{timeAgo(conv.last_at)}</span>
                        </div>
                        <p className="text-[11px] text-slate-400 truncate mt-0.5">
                          {conv.last_role === "assistant" && <span className="text-brand-500">Bot: </span>}
                          {conv.last_message}
                        </p>
                        <div className="mt-1">
                          <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full border ${cfg.bg} ${cfg.color}`}>
                            {cfg.label}
                          </span>
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </Card>

        {/* Right — Chat Window */}
        {selected && selectedConv ? (
          <Card padding="none" className="flex-1 flex flex-col">
            {/* Chat Header */}
            <div className="p-4 border-b border-surface-100 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`w-9 h-9 rounded-full flex items-center justify-center ${statusConfig[selectedConv.status].bg} border ${statusConfig[selectedConv.status].color}`}>
                  {(() => { const Icon = statusConfig[selectedConv.status].icon; return <Icon className="w-4 h-4" />; })()}
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-800">{selectedConv.lead_name || selectedConv.phone}</p>
                  <p className="text-xs text-slate-400">{selectedConv.phone}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {/* Status selector */}
                <select
                  value={selectedConv.status}
                  onChange={e => updateStatus(selected, e.target.value as ConvStatus)}
                  className="text-xs border border-surface-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"
                >
                  <option value="open">Open</option>
                  <option value="warm">Warm</option>
                  <option value="hot">Hot 🔥</option>
                  <option value="cold">Cold</option>
                  <option value="booked">Booked ✅</option>
                  <option value="human_takeover">Human Taking Over</option>
                </select>
                {/* Call button */}
                <a href={`tel:${selectedConv.phone}`}>
                  <Button variant="secondary" size="sm" icon={<PhoneCall className="w-3.5 h-3.5" />}>
                    Call
                  </Button>
                </a>
                {/* Bot toggle */}
                <Button
                  size="sm"
                  variant={isHuman ? "primary" : "secondary"}
                  icon={isHuman ? <User className="w-3.5 h-3.5" /> : <Bot className="w-3.5 h-3.5" />}
                  onClick={() => toggleTakeover(selected, !isHuman)}
                  className={isHuman ? "bg-purple-600 hover:bg-purple-700 border-0" : ""}
                >
                  {isHuman ? "You're On" : "Take Over"}
                </Button>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {messages.length === 0 ? (
                <div className="text-center text-xs text-slate-400 mt-8">No messages yet</div>
              ) : (
                messages.map(msg => (
                  <div key={msg.id} className={`flex ${msg.role === "assistant" ? "justify-end" : "justify-start"}`}>
                    <div className={`flex items-end gap-2 max-w-[75%] ${msg.role === "assistant" ? "flex-row-reverse" : ""}`}>
                      <div className={`w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center text-[10px] font-bold ${msg.role === "assistant" ? (msg.is_bot ? "bg-brand-100 text-brand-600" : "bg-purple-100 text-purple-600") : "bg-slate-100 text-slate-500"}`}>
                        {msg.role === "assistant" ? (msg.is_bot ? "🤖" : "👤") : "💬"}
                      </div>
                      <div className={`rounded-2xl px-3 py-2 text-sm ${msg.role === "assistant" ? (msg.is_bot ? "bg-brand-600 text-white rounded-br-sm" : "bg-purple-600 text-white rounded-br-sm") : "bg-surface-100 text-slate-800 rounded-bl-sm"}`}>
                        <p className="leading-relaxed whitespace-pre-wrap">{msg.message}</p>
                        <p className={`text-[10px] mt-1 ${msg.role === "assistant" ? "text-white/60" : "text-slate-400"}`}>
                          {timeAgo(msg.created_at)}
                          {msg.role === "assistant" && (
                            <span className="ml-1">{msg.is_bot ? "· Bot" : "· You"}</span>
                          )}
                        </p>
                      </div>
                    </div>
                  </div>
                ))
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Reply Box */}
            <div className="p-3 border-t border-surface-100">
              {!isHuman && (
                <div className="flex items-center gap-2 mb-2 text-xs text-slate-400 bg-surface-50 rounded-lg px-3 py-2">
                  <Bot className="w-3.5 h-3.5 text-brand-500" />
                  <span>Bot is handling this conversation. Click <strong>Take Over</strong> to reply manually.</span>
                </div>
              )}
              <div className="flex gap-2">
                <textarea
                  value={replyText}
                  onChange={e => setReplyText(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleReply(); }}}
                  placeholder={isHuman ? "Type your reply... (Enter to send)" : "Take over to reply manually..."}
                  disabled={!isHuman}
                  rows={2}
                  className="flex-1 rounded-xl border border-surface-200 bg-white px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:opacity-40 disabled:cursor-not-allowed"
                />
                <Button
                  icon={<Send className="w-4 h-4" />}
                  onClick={handleReply}
                  loading={sending}
                  disabled={!replyText.trim() || !isHuman}
                  className="self-end"
                >
                  Send
                </Button>
              </div>
            </div>
          </Card>
        ) : (
          <Card className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <div className="w-16 h-16 rounded-full bg-surface-100 flex items-center justify-center mx-auto mb-4">
                <MessageCircle className="w-7 h-7 text-slate-300" />
              </div>
              <p className="text-sm font-medium text-slate-600">Select a conversation</p>
              <p className="text-xs text-slate-400 mt-1">Click any chat to view the full conversation</p>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
