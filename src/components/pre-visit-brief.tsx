'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
    FileText, Printer, AlertCircle, Microscope, Pill, CalendarClock,
    ChevronDown, ChevronUp, Clock, Activity, TrendingUp
} from 'lucide-react';

interface Issue {
    id: string;
    issue_name: string;
    status: 'active' | 'monitoring' | 'resolved';
    lifecycle_state: string;
    evidence_quote?: string;
}

interface Investigation {
    id: string;
    test_name: string;
    test_category: string;
    test_date: string | null;
    result_summary: string | null;
    next_due_date: string | null;
    lifecycle_state: string;
}

interface Intervention {
    id: string;
    intervention_name: string;
    intervention_type: string;
    start_date: string | null;
    response: 'Effective' | 'Partial' | 'Ineffective' | 'Unknown' | 'Ongoing';
    lifecycle_state: string;
}

interface PreVisitBriefProps {
    patientName: string;
    patientId: string;
    issues: Issue[];
    investigations: Investigation[];
    interventions: Intervention[];
}

export function PreVisitBrief({
    patientName,
    patientId,
    issues,
    investigations,
    interventions
}: PreVisitBriefProps) {
    // Default to expanded for hero presentation
    const [isExpanded, setIsExpanded] = useState(true);

    // Filter to accepted/clinician-entered items only
    const activeIssues = issues.filter(i =>
        (i.lifecycle_state === 'accepted' || i.lifecycle_state === 'clinician_entered') &&
        i.status === 'active'
    );
    const monitoringIssues = issues.filter(i =>
        (i.lifecycle_state === 'accepted' || i.lifecycle_state === 'clinician_entered') &&
        i.status === 'monitoring'
    );

    const acceptedInvestigations = investigations.filter(i =>
        i.lifecycle_state === 'accepted' || i.lifecycle_state === 'clinician_entered'
    );
    const recentInvestigations = acceptedInvestigations.slice(0, 5); // Last 5
    const upcomingRecalls = acceptedInvestigations.filter(i => i.next_due_date);

    const acceptedInterventions = interventions.filter(i =>
        i.lifecycle_state === 'accepted' || i.lifecycle_state === 'clinician_entered'
    );
    const effectiveInterventions = acceptedInterventions.filter(i => i.response === 'Effective');
    const ineffectiveInterventions = acceptedInterventions.filter(i => i.response === 'Ineffective');
    const ongoingInterventions = acceptedInterventions.filter(i => i.response === 'Ongoing');

    const handlePrint = () => {
        window.print();
    };

    const today = new Date().toLocaleDateString('en-AU', {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
    });

    // Quick Stats for hero header
    const quickStats = [
        { label: 'Active Issues', value: activeIssues.length, icon: AlertCircle, color: 'text-red-600 bg-red-50' },
        { label: 'Recalls Due', value: upcomingRecalls.length, icon: CalendarClock, color: 'text-amber-600 bg-amber-50' },
        { label: 'Ongoing Meds', value: ongoingInterventions.length, icon: Pill, color: 'text-blue-600 bg-blue-50' },
    ];

    if (!isExpanded) {
        return (
            <Card className="border-indigo-200 bg-gradient-to-r from-indigo-600 via-violet-600 to-purple-600 shadow-lg print:hidden overflow-hidden">
                <CardHeader className="flex flex-row items-center justify-between py-4 px-6">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-white/20 rounded-lg backdrop-blur-sm">
                            <FileText className="h-5 w-5 text-white" />
                        </div>
                        <div>
                            <CardTitle className="text-lg font-semibold text-white">Pre-Visit Brief</CardTitle>
                            <p className="text-indigo-100 text-xs mt-0.5">Quick summary • {today}</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-4">
                        {/* Mini stats preview */}
                        <div className="hidden sm:flex items-center gap-3">
                            {quickStats.map((stat) => (
                                <div key={stat.label} className="flex items-center gap-1.5 text-white/90">
                                    <stat.icon className="h-3.5 w-3.5" />
                                    <span className="text-sm font-medium">{stat.value}</span>
                                </div>
                            ))}
                        </div>
                        <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => setIsExpanded(true)}
                            className="h-8 text-xs bg-white/20 text-white hover:bg-white/30 border-0 backdrop-blur-sm"
                        >
                            <ChevronDown className="h-3 w-3 mr-1" />
                            Expand
                        </Button>
                    </div>
                </CardHeader>
            </Card>
        );
    }

    return (
        <Card className="border-0 shadow-xl print:shadow-none print:border print:border-gray-300 overflow-hidden">
            {/* Hero Gradient Header */}
            <CardHeader className="bg-gradient-to-r from-indigo-600 via-violet-600 to-purple-600 py-5 px-6 print:bg-white print:border-b print:border-gray-200">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                        <div className="p-2.5 bg-white/20 rounded-xl backdrop-blur-sm print:bg-gray-100">
                            <FileText className="h-6 w-6 text-white print:text-gray-700" />
                        </div>
                        <div>
                            <CardTitle className="text-xl font-bold text-white print:text-gray-900">Pre-Visit Brief</CardTitle>
                            <p className="text-indigo-100 text-sm mt-0.5 print:text-gray-500">{today}</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2 print:hidden">
                        <Button
                            size="sm"
                            variant="secondary"
                            onClick={handlePrint}
                            className="h-8 text-xs bg-white/20 text-white hover:bg-white/30 border-0 backdrop-blur-sm"
                        >
                            <Printer className="h-3 w-3 mr-1" />
                            Print
                        </Button>
                        <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => setIsExpanded(false)}
                            className="h-8 text-xs bg-white/20 text-white hover:bg-white/30 border-0 backdrop-blur-sm"
                        >
                            <ChevronUp className="h-3 w-3 mr-1" />
                            Collapse
                        </Button>
                    </div>
                </div>

                {/* Quick Stats Bar */}
                <div className="flex flex-wrap gap-3 mt-4 print:hidden">
                    {quickStats.map((stat) => (
                        <div
                            key={stat.label}
                            className="flex items-center gap-2 bg-white/15 backdrop-blur-sm rounded-lg px-3 py-2"
                        >
                            <stat.icon className="h-4 w-4 text-white" />
                            <span className="text-white font-semibold">{stat.value}</span>
                            <span className="text-indigo-100 text-sm">{stat.label}</span>
                        </div>
                    ))}
                </div>
            </CardHeader>

            <CardContent className="pt-6 pb-6 px-6 space-y-6 bg-gradient-to-b from-slate-50/50 to-white">
                {/* Header for Print */}
                <div className="hidden print:block border-b-2 border-black pb-4 mb-4">
                    <h1 className="text-2xl font-bold">{patientName}</h1>
                    <p className="text-sm text-gray-600">Generated: {today}</p>
                </div>

                {/* PROBLEM LIST */}
                <section className="bg-white rounded-xl p-4 border border-slate-100 shadow-sm">
                    <h3 className="font-semibold text-sm flex items-center gap-2 mb-4 text-slate-800">
                        <div className="p-1.5 bg-red-50 rounded-lg">
                            <AlertCircle className="h-4 w-4 text-red-600" />
                        </div>
                        Problem List
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="bg-red-50/50 rounded-lg p-3 border border-red-100">
                            <h4 className="text-xs font-semibold text-red-700 uppercase mb-2 flex items-center gap-1">
                                <Activity className="h-3 w-3" />
                                Active ({activeIssues.length})
                            </h4>
                            {activeIssues.length === 0 ? (
                                <p className="text-xs text-slate-400 italic">None</p>
                            ) : (
                                <ul className="space-y-1.5">
                                    {activeIssues.map(i => (
                                        <li key={i.id} className="text-sm flex items-center gap-2">
                                            <span className="w-1.5 h-1.5 bg-red-500 rounded-full flex-shrink-0"></span>
                                            <span className="text-slate-700">{i.issue_name}</span>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                        <div className="bg-amber-50/50 rounded-lg p-3 border border-amber-100">
                            <h4 className="text-xs font-semibold text-amber-700 uppercase mb-2 flex items-center gap-1">
                                <TrendingUp className="h-3 w-3" />
                                Monitoring ({monitoringIssues.length})
                            </h4>
                            {monitoringIssues.length === 0 ? (
                                <p className="text-xs text-slate-400 italic">None</p>
                            ) : (
                                <ul className="space-y-1.5">
                                    {monitoringIssues.map(i => (
                                        <li key={i.id} className="text-sm flex items-center gap-2">
                                            <span className="w-1.5 h-1.5 bg-amber-500 rounded-full flex-shrink-0"></span>
                                            <span className="text-slate-700">{i.issue_name}</span>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    </div>
                </section>

                {/* RECENT INVESTIGATIONS */}
                <section className="bg-white rounded-xl p-4 border border-slate-100 shadow-sm">
                    <h3 className="font-semibold text-sm flex items-center gap-2 mb-4 text-slate-800">
                        <div className="p-1.5 bg-indigo-50 rounded-lg">
                            <Microscope className="h-4 w-4 text-indigo-600" />
                        </div>
                        Recent Investigations
                    </h3>
                    {recentInvestigations.length === 0 ? (
                        <p className="text-xs text-slate-400 italic">No investigations on record</p>
                    ) : (
                        <div className="space-y-2">
                            {recentInvestigations.map(i => (
                                <div key={i.id} className="flex items-center justify-between text-sm bg-slate-50 p-2.5 rounded-lg">
                                    <span className="text-slate-700 font-medium">{i.test_name}</span>
                                    <Badge variant="outline" className="text-[10px] bg-white">
                                        {i.test_date || 'No date'}
                                    </Badge>
                                </div>
                            ))}
                        </div>
                    )}
                </section>

                {/* RECALLS / SURVEILLANCE */}
                {upcomingRecalls.length > 0 && (
                    <section className="bg-gradient-to-r from-amber-50 to-orange-50 rounded-xl p-4 border border-amber-200 shadow-sm">
                        <h3 className="font-semibold text-sm flex items-center gap-2 mb-4 text-amber-800">
                            <div className="p-1.5 bg-amber-100 rounded-lg">
                                <CalendarClock className="h-4 w-4 text-amber-600" />
                            </div>
                            Upcoming Recalls
                            <Badge className="ml-auto bg-amber-500 text-white text-[10px]">
                                {upcomingRecalls.length} scheduled
                            </Badge>
                        </h3>
                        <div className="space-y-2">
                            {upcomingRecalls.map(i => (
                                <div key={i.id} className="flex items-center justify-between text-sm bg-white/80 p-3 rounded-lg border border-amber-100">
                                    <span className="text-slate-700 font-medium">{i.test_name}</span>
                                    <Badge variant="outline" className="text-[10px] border-amber-400 text-amber-700 bg-amber-50">
                                        <Clock className="h-3 w-3 mr-1" />
                                        Due: {i.next_due_date}
                                    </Badge>
                                </div>
                            ))}
                        </div>
                    </section>
                )}

                {/* INTERVENTIONS SUMMARY */}
                <section className="bg-white rounded-xl p-4 border border-slate-100 shadow-sm">
                    <h3 className="font-semibold text-sm flex items-center gap-2 mb-4 text-slate-800">
                        <div className="p-1.5 bg-violet-50 rounded-lg">
                            <Pill className="h-4 w-4 text-violet-600" />
                        </div>
                        Interventions Summary
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
                        <div className="bg-emerald-50/50 rounded-lg p-3 border border-emerald-100">
                            <h4 className="text-xs font-semibold text-emerald-700 uppercase mb-2">
                                ✓ Effective ({effectiveInterventions.length})
                            </h4>
                            {effectiveInterventions.length === 0 ? (
                                <p className="text-xs text-slate-400 italic">None</p>
                            ) : (
                                <ul className="space-y-1">
                                    {effectiveInterventions.slice(0, 5).map(i => (
                                        <li key={i.id} className="text-xs text-emerald-800">✓ {i.intervention_name}</li>
                                    ))}
                                </ul>
                            )}
                        </div>
                        <div className="bg-red-50/50 rounded-lg p-3 border border-red-100">
                            <h4 className="text-xs font-semibold text-red-700 uppercase mb-2">
                                ✗ Ineffective ({ineffectiveInterventions.length})
                            </h4>
                            {ineffectiveInterventions.length === 0 ? (
                                <p className="text-xs text-slate-400 italic">None</p>
                            ) : (
                                <ul className="space-y-1">
                                    {ineffectiveInterventions.slice(0, 5).map(i => (
                                        <li key={i.id} className="text-xs text-red-800">✗ {i.intervention_name}</li>
                                    ))}
                                </ul>
                            )}
                        </div>
                        <div className="bg-blue-50/50 rounded-lg p-3 border border-blue-100">
                            <h4 className="text-xs font-semibold text-blue-700 uppercase mb-2">
                                → Currently On ({ongoingInterventions.length})
                            </h4>
                            {ongoingInterventions.length === 0 ? (
                                <p className="text-xs text-slate-400 italic">None</p>
                            ) : (
                                <ul className="space-y-1">
                                    {ongoingInterventions.slice(0, 5).map(i => (
                                        <li key={i.id} className="text-xs text-blue-800">→ {i.intervention_name}</li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    </div>
                </section>

                {/* Footer for Print */}
                <div className="hidden print:block border-t pt-4 mt-6 text-xs text-gray-500">
                    <p>Generated by Patient Compiler • {today}</p>
                </div>
            </CardContent>
        </Card>
    );
}
