import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Briefcase, TrendingUp, Award, BarChart3 } from "lucide-react";

interface StatsCardsProps {
  stats: {
    total: number;
    byStatus: Record<string, number>;
    interviewRate: number;
    offerRate: number;
  };
}

export function StatsCards({ stats }: StatsCardsProps) {
  const cards = [
    {
      title: "Total Applications",
      value: stats.total,
      icon: Briefcase,
      format: (v: number) => v.toString(),
    },
    {
      title: "Active",
      value:
        stats.total -
        (stats.byStatus.REJECTED || 0) -
        (stats.byStatus.WITHDRAWN || 0) -
        (stats.byStatus.OFFER || 0),
      icon: BarChart3,
      format: (v: number) => v.toString(),
    },
    {
      title: "Interview Rate",
      value: stats.interviewRate,
      icon: TrendingUp,
      format: (v: number) => `${(v * 100).toFixed(0)}%`,
    },
    {
      title: "Offer Rate",
      value: stats.offerRate,
      icon: Award,
      format: (v: number) => `${(v * 100).toFixed(0)}%`,
    },
  ];

  return (
    <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
      {cards.map((card) => (
        <Card key={card.title}>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {card.title}
            </CardTitle>
            <card.icon className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{card.format(card.value)}</div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
