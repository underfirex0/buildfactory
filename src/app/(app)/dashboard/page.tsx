import { supabase } from "@/lib/supabase";
import { PageHeader } from "@/components/layout/Header";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import {
  Users,
  FileCode2,
  Hammer,
  CheckCircle2,
  Clock,
  TrendingUp,
  ArrowUpRight,
  Building2,
} from "lucide-react";
import Link from "next/link";
import { BUILD_STATUS_META, formatDateRelative } from "@/lib/utils";
import type { Build, DashboardStats } from "@/types";

async function getDashboardData() {
  const [
    { count: totalLeads },
    { count: totalTemplates },
    { count: totalBuilds },
    { count: successfulBuilds },
    { count: pendingBuilds },
    { count: failedBuilds },
    { data: recentBuilds },
  ] = await Promise.all([
    supabase.from("leads").select("*", { count: "exact", head: true }),
    supabase.from("templates").select("*", { count: "exact", head: true }),
    supabase.from("builds").select("*", { count: "exact", head: true }),
    supabase
      .from("builds")
      .select("*", { count: "exact", head: true })
      .eq("status", "done"),
    supabase
      .from("builds")
      .select("*", { count: "exact", head: true })
      .in("status", ["pending", "building"]),
    supabase
      .from("builds")
      .select("*", { count: "exact", head: true })
      .eq("status", "failed"),
    supabase
      .from("builds")
      .select("*, leads(company_name, city, category), templates(name)")
      .order("created_at", { ascending: false })
      .limit(6),
  ]);

  const stats: DashboardStats = {
    totalLeads: totalLeads ?? 0,
    totalTemplates: totalTemplates ?? 0,
    totalBuilds: totalBuilds ?? 0,
    successfulBuilds: successfulBuilds ?? 0,
    pendingBuilds: pendingBuilds ?? 0,
    failedBuilds: failedBuilds ?? 0,
  };

  return { stats, recentBuilds: (recentBuilds ?? []) as Build[] };
}

const successRate = (done: number, total: number) =>
  total === 0 ? 0 : Math.round((done / total) * 100);

export default async function DashboardPage() {
  const { stats, recentBuilds } = await getDashboardData();

  const statCards = [
    {
      label: "Total Leads",
      value: stats.totalLeads,
      icon: Users,
      color: "text-brand-600",
      bg: "bg-brand-50",
      href: "/leads",
      trend: null,
    },
    {
      label: "Templates",
      value: stats.totalTemplates,
      icon: FileCode2,
      color: "text-violet-600",
      bg: "bg-violet-50",
      href: "/templates",
      trend: null,
    },
    {
      label: "Total Builds",
      value: stats.totalBuilds,
      icon: Hammer,
      color: "text-amber-600",
      bg: "bg-amber-50",
      href: "/build-queue",
      trend: null,
    },
    {
      label: "Success Rate",
      value: `${successRate(stats.successfulBuilds, stats.totalBuilds)}%`,
      icon: TrendingUp,
      color: "text-emerald-600",
      bg: "bg-emerald-50",
      href: "/build-queue",
      trend: stats.successfulBuilds,
    },
  ];

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Dashboard"
        description="Overview of your website generation pipeline"
      />

      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {statCards.map((stat) => (
          <Link href={stat.href} key={stat.label}>
            <Card hover className="group">
              <div className="flex items-start justify-between mb-4">
                <div className={`w-9 h-9 rounded-xl ${stat.bg} flex items-center justify-center`}>
                  <stat.icon className={`w-4 h-4 ${stat.color}`} />
                </div>
                <ArrowUpRight className="w-3.5 h-3.5 text-slate-300 group-hover:text-brand-400 transition-colors" />
              </div>
              <p className="text-2xl font-bold text-slate-900 mb-1">{stat.value}</p>
              <p className="text-xs text-slate-500 font-medium">{stat.label}</p>
            </Card>
          </Link>
        ))}
      </div>

      {/* Build Status Summary */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-8">
        <Card className="col-span-1 lg:col-span-2" padding="none">
          <div className="px-5 py-4 border-b border-surface-100 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-700">Recent Builds</h2>
            <Link
              href="/build-queue"
              className="text-xs text-brand-600 hover:text-brand-700 font-medium flex items-center gap-1"
            >
              View all <ArrowUpRight className="w-3 h-3" />
            </Link>
          </div>
          {recentBuilds.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">
                <Hammer className="w-5 h-5 text-slate-400" />
              </div>
              <p className="text-sm text-slate-500">No builds yet</p>
              <p className="text-xs text-slate-400 mt-1">
                Go to Build Queue to start generating sites
              </p>
            </div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Business</th>
                  <th>Template</th>
                  <th>Status</th>
                  <th>When</th>
                </tr>
              </thead>
              <tbody>
                {recentBuilds.map((build) => {
                  const meta = BUILD_STATUS_META[build.status] ?? BUILD_STATUS_META.pending;
                  return (
                    <tr key={build.id}>
                      <td>
                        <div className="flex items-center gap-2.5">
                          <div className="w-7 h-7 rounded-lg bg-surface-100 flex items-center justify-center flex-shrink-0">
                            <Building2 className="w-3.5 h-3.5 text-slate-400" />
                          </div>
                          <div>
                            <p className="font-medium text-slate-800 text-xs">
                              {(build as any).leads?.company_name ?? "—"}
                            </p>
                            <p className="text-slate-400 text-[10px]">
                              {(build as any).leads?.city}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td>
                        <span className="text-xs text-slate-500">
                          {(build as any).templates?.name ?? "—"}
                        </span>
                      </td>
                      <td>
                        <span
                          className={`inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full border ${meta.bg} ${meta.color}`}
                        >
                          <span className={`w-1.5 h-1.5 rounded-full ${meta.dot}`} />
                          {meta.label}
                        </span>
                      </td>
                      <td>
                        <span className="text-xs text-slate-400">
                          {formatDateRelative(build.created_at)}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </Card>

        {/* Quick stats sidebar */}
        <Card>
          <h2 className="text-sm font-semibold text-slate-700 mb-4">Build Overview</h2>
          <div className="space-y-3">
            {[
              {
                label: "Completed",
                value: stats.successfulBuilds,
                icon: CheckCircle2,
                color: "text-emerald-600",
                bg: "bg-emerald-50",
              },
              {
                label: "In Progress",
                value: stats.pendingBuilds,
                icon: Clock,
                color: "text-amber-600",
                bg: "bg-amber-50",
              },
              {
                label: "Failed",
                value: stats.failedBuilds,
                icon: Hammer,
                color: "text-red-600",
                bg: "bg-red-50",
              },
            ].map((item) => (
              <div key={item.label} className="flex items-center gap-3">
                <div className={`w-8 h-8 rounded-lg ${item.bg} flex items-center justify-center`}>
                  <item.icon className={`w-4 h-4 ${item.color}`} />
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-500">{item.label}</span>
                    <span className="text-sm font-semibold text-slate-800">{item.value}</span>
                  </div>
                  <div className="mt-1 h-1 bg-surface-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${item.bg.replace("bg-", "bg-").replace("-50", "-400")}`}
                      style={{
                        width: `${successRate(item.value, stats.totalBuilds)}%`,
                      }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-6 pt-4 border-t border-surface-100">
            <p className="text-xs text-slate-500 mb-1">Overall success rate</p>
            <p className="text-2xl font-bold text-slate-900">
              {successRate(stats.successfulBuilds, stats.totalBuilds)}
              <span className="text-sm font-medium text-slate-400">%</span>
            </p>
          </div>
        </Card>
      </div>
    </div>
  );
}
