export function AdminSectionPlaceholder({ title, description }) {
  return (
    <div className="p-6 md:p-8">
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
        {title}
      </h1>
      <p className="mt-2 max-w-xl text-sm text-slate-600">
        {description ?? "This section is coming soon."}
      </p>
    </div>
  );
}
