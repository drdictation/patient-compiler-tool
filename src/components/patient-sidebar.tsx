'use client';

import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import {
    AlertCircle, Microscope, Pill, Calendar, FileText, ChevronRight
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface PatientSidebarProps {
    patientName: string;
    activeIssuesCount: number;
    upcomingRecallsCount: number;
    ongoingInterventionsCount: number;
}

const navItems = [
    { id: 'timeline', label: 'Timeline', icon: Calendar },
    { id: 'brief', label: 'Pre-Visit Brief', icon: FileText },
    { id: 'tasks', label: 'Tasks', icon: FileText },
    { id: 'issues', label: 'Issues', icon: AlertCircle },
    { id: 'investigations', label: 'Investigations', icon: Microscope },
    { id: 'interventions', label: 'Interventions', icon: Pill },
];

export function PatientSidebar({
    patientName,
    activeIssuesCount,
    upcomingRecallsCount,
    ongoingInterventionsCount,
}: PatientSidebarProps) {
    const [activeSection, setActiveSection] = useState('brief');

    useEffect(() => {
        const observer = new IntersectionObserver(
            (entries) => {
                entries.forEach((entry) => {
                    if (entry.isIntersecting && entry.intersectionRatio > 0.3) {
                        setActiveSection(entry.target.id);
                    }
                });
            },
            {
                rootMargin: '-100px 0px -60% 0px',
                threshold: [0.3, 0.5],
            }
        );

        // Observe all sections
        navItems.forEach((item) => {
            const element = document.getElementById(item.id);
            if (element) observer.observe(element);
        });

        return () => observer.disconnect();
    }, []);

    const scrollToSection = (sectionId: string) => {
        const element = document.getElementById(sectionId);
        if (element) {
            const offset = 100; // Account for sticky header
            const elementPosition = element.getBoundingClientRect().top;
            const offsetPosition = elementPosition + window.pageYOffset - offset;

            window.scrollTo({
                top: offsetPosition,
                behavior: 'smooth',
            });
        }
    };

    return (
        <aside className="w-64 flex-shrink-0 hidden lg:block">
            <div className="sticky top-20 space-y-4">
                {/* Patient Summary Card */}
                <Card className="p-4 bg-gradient-to-br from-slate-50 to-white border-slate-200">
                    <h3 className="font-semibold text-sm text-slate-800 truncate" title={patientName}>
                        {patientName}
                    </h3>
                    <Separator className="my-3" />
                    <div className="space-y-2 text-xs">
                        <div className="flex items-center justify-between">
                            <span className="text-slate-500 flex items-center gap-1.5">
                                <AlertCircle className="h-3 w-3 text-red-500" />
                                Active Issues
                            </span>
                            <Badge variant="secondary" className="h-5 px-1.5 text-[10px] bg-red-50 text-red-700 border-red-200">
                                {activeIssuesCount}
                            </Badge>
                        </div>
                        <div className="flex items-center justify-between">
                            <span className="text-slate-500 flex items-center gap-1.5">
                                <Calendar className="h-3 w-3 text-amber-500" />
                                Upcoming Recalls
                            </span>
                            <Badge variant="secondary" className="h-5 px-1.5 text-[10px] bg-amber-50 text-amber-700 border-amber-200">
                                {upcomingRecallsCount}
                            </Badge>
                        </div>
                        <div className="flex items-center justify-between">
                            <span className="text-slate-500 flex items-center gap-1.5">
                                <Pill className="h-3 w-3 text-blue-500" />
                                Ongoing Meds
                            </span>
                            <Badge variant="secondary" className="h-5 px-1.5 text-[10px] bg-blue-50 text-blue-700 border-blue-200">
                                {ongoingInterventionsCount}
                            </Badge>
                        </div>
                    </div>
                </Card>

                {/* Navigation */}
                <Card className="p-2 border-slate-200">
                    <nav className="space-y-0.5">
                        {navItems.map((item) => {
                            const Icon = item.icon;
                            const isActive = activeSection === item.id;
                            return (
                                <Button
                                    key={item.id}
                                    variant="ghost"
                                    className={cn(
                                        "w-full justify-start h-9 px-3 text-sm font-normal",
                                        isActive
                                            ? "bg-indigo-50 text-indigo-700 font-medium"
                                            : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                                    )}
                                    onClick={() => scrollToSection(item.id)}
                                >
                                    <Icon className={cn(
                                        "h-4 w-4 mr-2",
                                        isActive ? "text-indigo-600" : "text-slate-400"
                                    )} />
                                    {item.label}
                                    {isActive && (
                                        <ChevronRight className="h-3 w-3 ml-auto text-indigo-400" />
                                    )}
                                </Button>
                            );
                        })}
                    </nav>
                </Card>
            </div>
        </aside>
    );
}
