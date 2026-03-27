import { Briefcase, TrendingUp, BarChart3, XCircle } from "lucide-react";

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
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  accent: string;
  accentBg: string;
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

  const cards: StatCard[] = [
    {
      title: "Total",
      value: stats.total,
      icon: Briefcase,
      accent: "#374151",
      accentBg: "rgba(55, 65, 81, 0.08)",
    },
    {
      title: "Active",
      value: active,
      icon: BarChart3,
      accent: "#1D4ED8",
      accentBg: "rgba(29, 78, 216, 0.07)",
    },
    {
      title: "Interviews",
      value: interviews,
      icon: TrendingUp,
      accent: "#6D28D9",
      accentBg: "rgba(109, 40, 217, 0.07)",
    },
    {
      title: "Rejections",
      value: rejections,
      icon: XCircle,
      accent: "#B91C1C",
      accentBg: "rgba(185, 28, 28, 0.07)",
    },
  ];

  return (
    <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
      {cards.map((card, i) => (
        <div
          key={card.title}
          className="relative rounded-lg overflow-hidden border bg-card animate-fade-up"
          style={{
            borderLeft: `3px solid ${card.accent}`,
            animationDelay: `${i * 60}ms`,
          }}
        >
          <div className="px-4 pt-4 pb-3">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
                {card.title}
              </p>
              <div
                className="flex h-7 w-7 items-center justify-center rounded-md"
                style={{ background: card.accentBg }}
              >
                <card.icon
                  className="h-3.5 w-3.5"
                  style={{ color: card.accent }}
                />
              </div>
            </div>
            <p className="font-mono text-3xl font-medium leading-none text-foreground">
              {card.value}
            </p>
          </div>

          {stats.total > 0 && (
            <div
              style={{
                position: "absolute",
                bottom: 0,
                left: 0,
                height: "2px",
                width: `${Math.min(100, (card.value / stats.total) * 100)}%`,
                background: card.accent,
                opacity: 0.3,
              }}
            />
          )}
        </div>
      ))}
    </div>
  );
}
