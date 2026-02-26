import { ReactNode } from "react";
import { BarChart3, FileText, LogIn, MapPin, Search } from "lucide-react";
import { Link, NavLink } from "react-router-dom";
import { useAuth } from "../lib/auth";

export default function Navbar() {
  const { user, signOut } = useAuth();

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-4">
        <Link to="/" className="flex items-center gap-3">
          <div className="rounded-xl bg-nagar-blue p-2.5 text-white">
            <span className="font-black">N</span>
          </div>
          <div>
            <p className="text-4 font-bold leading-none text-nagar-ink">NagarSeva</p>
            <p className="text-xs tracking-[0.2em] text-slate-500">SMART GRIEVANCE</p>
          </div>
        </Link>

        <nav className="hidden items-center gap-2 md:flex">
          <NavItem to="/file-complaint" icon={<FileText size={18} />} label="File Complaint" />
          <NavItem to="/track" icon={<Search size={18} />} label="Track" />
          <NavItem to="/map" icon={<MapPin size={18} />} label="City Map" />
          <NavItem to="/dashboard" icon={<BarChart3 size={18} />} label="My Dashboard" />
        </nav>

        <div className="flex items-center gap-3">
          {user ? (
            <>
              <div className="rounded-xl border border-slate-200 px-4 py-2 text-sm">
                <p className="font-semibold text-slate-800">{user.name}</p>
                <p className="text-xs uppercase tracking-wide text-slate-500">{user.role}</p>
              </div>
              <button
                type="button"
                onClick={signOut}
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
              >
                Logout
              </button>
            </>
          ) : (
            <Link
              to="/login"
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-100"
            >
              <LogIn size={16} />
              Sign In
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}

function NavItem({ to, icon, label }: { to: string; icon: ReactNode; label: string }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `inline-flex items-center gap-2 rounded-xl px-4 py-2 text-base ${
          isActive ? "bg-slate-100 text-nagar-blue" : "text-slate-600 hover:bg-slate-50"
        }`
      }
    >
      {icon}
      {label}
    </NavLink>
  );
}
