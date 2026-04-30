"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, FileCode2, Users, Hammer, Zap, ChevronRight, Globe, MessageCircle } from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/templates", label: "Templates", icon: FileCode2 },
  { href: "/leads", label: "Leads", icon: Users },
  { href: "/build-queue", label: "Build Queue", icon: Hammer },
  { href: "/sites", label: "Live Sites", icon: Globe, badge: "LIVE", badgeColor: "bg-emerald-100 text-emerald-700" },
  { href: "/whatsapp", label: "WhatsApp", icon: MessageCircle, badge: "NEW", badgeColor: "bg-green-100 text-green-700" },
  { href: "/inbox", label: "Inbox", icon: MessageCircle, badge: "AI", badgeColor: "bg-purple-100 text-purple-700" },
];

export function Sidebar() {
  const pathname = usePathname();
  return (
    <aside className="w-60 flex-shrink-0 h-screen sticky top-0 flex flex-col bg-white border-r border-surface-100">
      <div className="px-5 py-5 border-b border-surface-100">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-brand-gradient flex items-center justify-center shadow-glow-sm">
            <Zap className="w-4 h-4 text-white" />
          </div>
          <div>
            <span className="text-sm font-bold text-slate-900 tracking-tight">Build<span className="text-brand-600">Factory</span></span>
            <p className="text-[10px] text-slate-400 leading-none mt-0.5">Website Generator</p>
          </div>
        </div>
      </div>
      <nav className="flex-1 px-3 py-4 space-y-0.5">
        <p className="px-2 mb-2 text-[10px] font-semibold text-slate-400 uppercase tracking-widest">Menu</p>
        {navItems.map(({ href, label, icon: Icon, badge, badgeColor }) => {
          const isActive = pathname === href || pathname.startsWith(href + "/");
          return (
            <Link key={href} href={href} className={cn("group flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150", isActive ? "bg-brand-50 text-brand-700" : "text-slate-600 hover:bg-surface-50 hover:text-slate-900")}>
              <Icon className={cn("w-4 h-4 flex-shrink-0 transition-colors", isActive ? "text-brand-600" : "text-slate-400 group-hover:text-slate-600")} />
              <span className="flex-1">{label}</span>
              {badge && <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${badgeColor}`}>{badge}</span>}
              {isActive && <ChevronRight className="w-3 h-3 text-brand-400" />}
            </Link>
          );
        })}
      </nav>
      <div className="px-4 py-4 border-t border-surface-100">
        <div className="bg-brand-50 rounded-xl p-3 border border-brand-100">
          <p className="text-xs font-semibold text-brand-700 mb-0.5">MVP v1.0</p>
          <p className="text-[10px] text-brand-500 leading-relaxed">Bulk website generation & deployment</p>
        </div>
      </div>
    </aside>
  );
}
