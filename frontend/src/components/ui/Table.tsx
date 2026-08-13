export function TableWrap({ children }: { children: React.ReactNode }) {
  return (
    /**
     * The scroll container, an inline-block sizer, then the bordered box.
     *
     * The sizer is what fixes the border: a plain `min-w-full` div only ever
     * grows to the width of its parent, so a wider table spilled past the
     * rounded border and badges appeared to float outside the card.
     * `inline-block` makes it size to its content instead, so the border wraps
     * the whole table and the card scrolls as one piece.
     */
    <div className="overflow-x-auto px-5 pb-5 sm:px-6 sm:pb-6">
      <div className="inline-block min-w-full align-middle">
        <div className="overflow-hidden rounded-xl border border-ink-200/70">
          <table className="min-w-full">{children}</table>
        </div>
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
