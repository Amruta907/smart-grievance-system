import { CircleCheck, Clock3, FileText, Filter, Plus, RotateCcw } from "lucide-react";
import { ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { listGrievances, listMyGrievances } from "../lib/api";
import { useAuth } from "../lib/auth";
import { Grievance } from "../types";

export default function DashboardPage() {
  const { user, token } = useAuth();
  const [grievances, setGrievances] = useState<Grievance[]>([]);
  const [statusFilter, setStatusFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [toast, setToast] = useState<string | null>(null);
  const isAuthority = user?.role === "authority";
  const previousStatuses = useRef<Map<number, string>>(new Map());
  const initialized = useRef(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!token) return;
      let data: Grievance[] = [];
      if (user?.role === "citizen") {
        data = await listMyGrievances(token);
      } else {
        data = await listGrievances(token);
      }
      if (cancelled) return;

      const nextStatuses = new Map<number, string>();
      data.forEach((item) => nextStatuses.set(item.id, normalizeStatus(item)));

      if (initialized.current) {
        const changed = data.find((item) => {
          const prev = previousStatuses.current.get(item.id);
          const curr = normalizeStatus(item);
          return prev && prev !== curr;
        });
        if (changed) {
          const message = `Government authority has changed status of ${changed.ticket_number} to ${statusLabel(normalizeStatus(changed))}.`;
          setToast(message);
          window.alert(message);
        }
      } else {
        initialized.current = true;
      }

      previousStatuses.current = nextStatuses;
      setGrievances(data);
    }
    void load();
    const timer = setInterval(() => {
      void load();
    }, 10000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [user, token]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  const stats = useMemo(() => {
    const normalized = grievances.map((item) => normalizeStatus(item));
    const total = normalized.length;
    const closed = normalized.filter((status) => status === "closed").length;
    const accepted = normalized.filter((status) => status === "accepted").length;
    const inProgress = normalized.filter((status) => status === "in_progress").length;
    const open = total - closed;
    return { total, open, closed, accepted, inProgress };
  }, [grievances]);

  const categories = useMemo(() => {
    const all = grievances
      .map((item) => item.category_name)
      .filter((item): item is string => Boolean(item));
    return [...new Set(all)];
  }, [grievances]);

  const filteredGrievances = useMemo(() => {
    return grievances.filter((item) => {
      const normalizedStatus = normalizeStatus(item);
      const statusOk = statusFilter === "all" || normalizedStatus === statusFilter;
      const categoryOk = categoryFilter === "all" || item.category_name === categoryFilter;
      return statusOk && categoryOk;
    });
  }, [grievances, statusFilter, categoryFilter]);

  return (
    <main className="mx-auto max-w-7xl px-6 py-8">
      {toast ? (
        <div className="fixed right-4 top-24 z-50 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white shadow-lg">
          {toast}
        </div>
      ) : null}
      <section className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-5xl font-black text-slate-900">{isAuthority ? "Authority Console" : "My Complaints"}</h1>
          <p className="mt-1 text-2xl text-slate-600">
            {isAuthority ? "Review, filter, and monitor all citizen complaints" : "Track all your reported issues"}
          </p>
        </div>
        {!isAuthority ? (
          <Link
            to="/file-complaint"
            className="inline-flex items-center gap-2 rounded-xl bg-nagar-blue px-6 py-3 text-xl font-semibold text-white"
          >
            <Plus size={18} />
            New Complaint
          </Link>
        ) : null}
      </section>

      <section className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard title={isAuthority ? "Total Cases" : "Total Filed"} value={stats.total} icon={<FileText size={20} />} />
        <StatCard title="Open" value={stats.open} icon={<Clock3 size={20} />} />
        <StatCard title="Closed" value={stats.closed} icon={<CircleCheck size={20} />} />
        <StatCard title={isAuthority ? "Accepted" : "In Progress"} value={isAuthority ? stats.accepted : stats.inProgress} icon={<RotateCcw size={20} />} />
      </section>

      <section className="mt-6 flex flex-wrap items-center gap-3">
        <span className="inline-flex text-slate-500">
          <Filter size={20} />
        </span>
        <select
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value)}
          className="h-12 min-w-52 rounded-xl border border-slate-300 bg-white px-4 text-lg"
        >
          <option value="all">All Statuses</option>
          <option value="submitted">Submitted</option>
          <option value="accepted">Accepted</option>
          <option value="in_progress">In Progress</option>
          <option value="closed">Closed</option>
        </select>

        <select
          value={categoryFilter}
          onChange={(event) => setCategoryFilter(event.target.value)}
          className="h-12 min-w-52 rounded-xl border border-slate-300 bg-white px-4 text-lg"
        >
          <option value="all">All Categories</option>
          {categories.map((category) => (
            <option key={category} value={category}>
              {category}
            </option>
          ))}
        </select>
      </section>

      <section className="mt-6 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        {filteredGrievances.length === 0 ? (
          <div className="py-16 text-center">
            <div className="mx-auto mb-4 inline-flex rounded-2xl bg-slate-100 p-4 text-slate-500">
              <FileText size={34} />
            </div>
            <h2 className="text-4xl font-bold text-slate-900">No complaints found</h2>
            <p className="mt-2 text-2xl text-slate-500">
              {isAuthority ? "No complaints match the current filters." : "You haven&apos;t filed any complaints yet."}
            </p>
            {!isAuthority ? (
              <Link to="/file-complaint" className="mt-6 inline-flex rounded-xl bg-nagar-blue px-6 py-3 text-xl font-semibold text-white">
                File Your First Complaint
              </Link>
            ) : null}
          </div>
        ) : (
          <div className="space-y-3">
            {filteredGrievances.map((item) => (
              <div key={item.id} className="rounded-xl border border-slate-200 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-semibold text-slate-900">
                    {item.ticket_number} - {item.title}
                  </p>
                  <div className="flex items-center gap-2">
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-sm capitalize text-slate-700">
                      {statusLabel(normalizeStatus(item))}
                    </span>
                    {isAuthority ? (
                      <Link
                        to={`/authority/complaints/${item.id}`}
                        className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-1 text-sm font-medium text-blue-700"
                      >
                        Action
                      </Link>
                    ) : null}
                  </div>
                </div>
                <p className="mt-1 text-slate-600">{item.location}</p>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

function StatCard({ title, value, icon }: { title: string; value: number; icon: ReactNode }) {
  return (
    <article className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="inline-flex rounded-2xl bg-slate-100 p-3 text-nagar-blue">{icon}</div>
      <p className="mt-4 text-5xl font-black text-slate-900">{value}</p>
      <p className="text-xl text-slate-600">{title}</p>
    </article>
  );
}

function normalizeStatus(item: Grievance) {
  if (item.complaint_status === "accepted") return "accepted";
  if (item.complaint_status === "in_progress") return "in_progress";
  if (item.complaint_status === "closed") return "closed";
  if (item.status === "resolved") return "closed";
  if (item.status === "under_review" || item.status === "assigned" || item.status === "escalated" || item.status === "reopened") return "accepted";
  if (item.status === "in_progress" || item.status === "awaiting_confirmation") return "in_progress";
  if (item.status === "closed") return "closed";
  return "submitted";
}

function statusLabel(status: string) {
  if (status === "in_progress") return "In Progress";
  if (status === "accepted") return "Accepted";
  if (status === "closed") return "Closed";
  return "Submitted";
}
