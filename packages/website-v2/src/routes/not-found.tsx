import { createFileRoute } from "@tanstack/react-router";
import { Link } from "../components/RouterLink";

export const Route = createFileRoute("/not-found")({
  head: () => ({
    meta: [{ title: "Not Found | inlang" }],
  }),
  component: NotFoundPage,
});

function NotFoundPage() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-6 py-16 text-center">
      <p className="text-8xl font-bold text-slate-900">404</p>
      <h1 className="mt-4 text-2xl font-semibold tracking-tight text-slate-900">
        Page not found
      </h1>
      <p className="mt-2 max-w-md text-base text-slate-600">
        The page you're looking for doesn't exist or has been moved.
      </p>
      <Link
        to="/"
        className="mt-6 rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-slate-800"
      >
        Back to homepage
      </Link>
    </div>
  );
}
