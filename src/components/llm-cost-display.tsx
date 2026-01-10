'use client';

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getLLMCostStats } from "@/app/actions";
import { Coins, Loader2 } from "lucide-react";

export function LLMCostDisplay() {
    const [period, setPeriod] = useState<'day' | 'week' | 'month'>('day');
    const [stats, setStats] = useState<{ totalCost: number; count: number } | null>(null);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        let isMounted = true;

        async function fetchStats() {
            setLoading(true);
            try {
                const data = await getLLMCostStats(period);
                if (isMounted) setStats(data);
            } catch (err) {
                console.error("Failed to fetch LLM stats", err);
            } finally {
                if (isMounted) setLoading(false);
            }
        }

        fetchStats();

        return () => { isMounted = false; };
    }, [period]);

    return (
        <Card className="w-full h-full">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">LLM Usage Cost</CardTitle>
                <Coins className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
                <div className="flex flex-col gap-4">
                    <div className="flex items-center justify-between">
                        <div className="text-2xl font-bold">
                            {loading ? (
                                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                            ) : (
                                `$${stats?.totalCost.toFixed(4) || "0.0000"}`
                            )}
                        </div>
                        <Select value={period} onValueChange={(v: any) => setPeriod(v)}>
                            <SelectTrigger className="w-[100px] h-8 text-xs">
                                <SelectValue placeholder="Select period" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="day">Today</SelectItem>
                                <SelectItem value="week">7 Days</SelectItem>
                                <SelectItem value="month">30 Days</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    <p className="text-xs text-muted-foreground">
                        {loading
                            ? "Updating..."
                            : `${stats?.count || 0} calls in this period`
                        }
                    </p>
                </div>
            </CardContent>
        </Card>
    );
}
