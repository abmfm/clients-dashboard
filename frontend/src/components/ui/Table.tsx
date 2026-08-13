export function TableWrap({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto px-5 pb-5 sm:px-6 sm:pb-6">
      <div className="min-w-full overflow-hidden rounded-xl border border-ink-200/70">
        <table className="min-w-full">{children}</table>
      </div>
    </div>
  );
}

export function EmptyRow({ colSpan, label }: { colSpan: number; label: string }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-5 py-10 text-center text-[14px] text-ink-400">
        {label}
      </td>
    </tr>
  );
}
