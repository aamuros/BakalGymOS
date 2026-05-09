export default function OwnerReviewLoading() {
  return (
    <div className="page-enter space-y-6">
      <div className="grid gap-5 lg:grid-cols-[1fr_19rem]">
        <div className="h-52 animate-pulse rounded-xl bg-n-hover" />
        <div className="h-52 animate-pulse rounded-xl bg-n-hover" />
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <div className="h-32 animate-pulse rounded-xl bg-n-hover" />
        <div className="h-32 animate-pulse rounded-xl bg-n-hover" />
        <div className="h-32 animate-pulse rounded-xl bg-n-hover" />
      </div>
      <div className="h-56 animate-pulse rounded-xl bg-n-hover" />
      <div className="space-y-4">
        <div className="h-8 w-48 animate-pulse rounded-lg bg-n-hover" />
        <div className="h-48 animate-pulse rounded-lg bg-n-hover" />
        <div className="h-48 animate-pulse rounded-lg bg-n-hover" />
      </div>
    </div>
  );
}
