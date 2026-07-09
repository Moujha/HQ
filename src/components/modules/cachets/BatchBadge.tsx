export function BatchBadge({ count }: { count: number }) {
  return (
    <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[0.6rem] font-semibold text-muted-foreground">
      × {count}
    </span>
  );
}
