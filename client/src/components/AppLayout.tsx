import { NavLink, Outlet } from "react-router-dom";

const linkClass =
  "rounded-lg px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-900";

const activeClass =
  "bg-indigo-50 text-indigo-700 hover:bg-indigo-50 hover:text-indigo-700";

export function AppLayout() {
  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-b from-slate-50 to-white">
      <header className="sticky top-0 z-10 border-b border-indigo-100/80 bg-white/90 shadow-sm shadow-indigo-500/5 backdrop-blur-md supports-[backdrop-filter]:bg-white/75">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-6 px-4 sm:px-6 lg:px-8">
          <span className="bg-gradient-to-r from-indigo-600 to-violet-600 bg-clip-text text-base font-semibold tracking-tight text-transparent">
            HiredMe
          </span>
          <nav className="flex items-center gap-1" aria-label="Main">
            <NavLink
              to="/match"
              className={({ isActive }) =>
                `${linkClass} ${isActive ? activeClass : ""}`
              }
              end
            >
              Match
            </NavLink>
            <NavLink
              to="/interview"
              className={({ isActive }) =>
                `${linkClass} ${isActive ? activeClass : ""}`
              }
            >
              Interview
            </NavLink>
          </nav>
        </div>
      </header>
      <main className="flex-1">
        <Outlet />
      </main>
    </div>
  );
}
