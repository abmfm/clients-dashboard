import { TableSkeleton } from "@/components/ui/Skeleton";

export default function Loading() {
  return (
    <div className="anim-fade-in">
      <div className="mb-6">
        <div className="skeleton h-7 w-48" />
        <div className="skeleton mt-2.5 h-3.5 w-72" />
      </div>
      <TableSkeleton rows={6} />
    </div>
  );
}
