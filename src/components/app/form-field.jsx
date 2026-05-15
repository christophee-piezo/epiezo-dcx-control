export function FormField({ children, label, labelId, labelKey }) {
  return (
    <div className="space-y-2">
      <label className="text-[0.68rem] font-semibold uppercase tracking-[0.24em] text-muted-foreground" data-i18n={labelKey} id={labelId}>{label}</label>
      {children}
    </div>
  );
}
