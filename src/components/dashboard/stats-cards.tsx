interface StatsCardsProps {
  stats: {
    total: number;
    byStatus: Record<string, number>;
    interviewRate: number;
  };
}

interface StatCard {
  title: string;
  value: number;
  sub: string;
  dot: string;
}

export function StatsCards({ stats }: StatsCardsProps) {
  const active =
    stats.total -
    (stats.byStatus.REJECTED || 0) -
    (stats.byStatus.WITHDRAWN || 0) -
    (stats.byStatus.OFFER || 0);

  const interviews =
    (stats.byStatus.INTERVIEW || 0) + (stats.byStatus.FINAL_ROUND || 0);

  const rejections = stats.byStatus.REJECTED || 0;

  const pct = (n: number) =>
    stats.total > 0 ? `${Math.round((n / stats.total) * 100)}% of total` : "—";

  // Dot hues follow the status badge palette: indigo = applied/pending,
  // purple = interview, red = rejected.
  const cards: StatCard[] = [
    {
      title: "Total",
      value: stats.total,
      sub: "applications tracked",
      dot: "bg-foreground/60",
    },
    {
      title: "Active",
      value: active,
      sub: pct(active),
      dot: "bg-indigo-500 dark:bg-indigo-400",
    },
    {
      title: "Interviews",
      value: interviews,
      sub: pct(interviews),
      dot: "bg-purple-500 dark:bg-purple-400",
    },
    {
      title: "Rejections",
      value: rejections,
      sub: pct(rejections),
      dot: "bg-red-500 dark:bg-red-400",
    },
  ];

  return (
    <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
      {cards.map((card, i) => (
        <div
          key={card.title}
          className="rounded-xl border bg-card px-5 py-4 shadow-xs animate-fade-up"
          style={{ animationDelay: `${i * 60}ms` }}
        >
          <div className="flex items-center gap-2">
            <span className={`h-1.5 w-1.5 rounded-full ${card.dot}`} />
            <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
              {card.title}
            </p>
          </div>
          <p className="mt-2.5 font-heading text-4xl font-medium leading-none text-foreground">
            {card.value}
          </p>
          <p className="mt-2 text-xs text-muted-foreground">{card.sub}</p>
        </div>
      ))}
    </div>
  );
}
