import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { SyncButton } from '@/components/sync-button';
import { Button } from '@/components/ui/button';
import { Users, Search, Inbox } from 'lucide-react';
import { PatientList } from '@/components/patient-list';
import { AddPatientDialog } from '@/components/add-patient-dialog';
import { LLMCostDisplay } from '@/components/llm-cost-display';
import { TasksSidebar } from '@/components/tasks-sidebar';
import { GlobalSearch } from '@/components/global-search';
import { EndoscopyListDialog } from '@/components/endoscopy-list-dialog';
import { MobileHeaderActions } from '@/components/mobile-header-actions';
import { getTodayRoster } from '@/app/actions';

export const dynamic = 'force-dynamic';

interface DashboardProps {
  searchParams: Promise<{
    search?: string;
    sort?: string;
    filter_recall?: string;
    filter_suggested?: string;
  }>;
}

const PATIENT_SUMMARY_COLUMNS = `
  id,
  display_name,
  normalized_name,
  identity_verified,
  last_seen,
  encounter_count,
  record_count,
  referring_doctor,
  next_recall_date,
  suggested_items_count,
  pending_task_count
`;

async function fetchAllPatientSummaries(
  buildQuery: (from: number, to: number) => any
) {
  const PAGE_SIZE = 1000;
  const rows: any[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await buildQuery(from, from + PAGE_SIZE - 1);
    if (error) return { data: null, error };
    if (!data || data.length === 0) break;
    rows.push(...data);
    if (data.length < PAGE_SIZE) break;
  }
  return { data: rows, error: null };
}

export default async function Dashboard(props: DashboardProps) {
  const searchParams = await props.searchParams;
  const search = searchParams.search || '';
  const sort = searchParams.sort || 'last_seen'; // 'name', 'last_seen', 'recall'
  const filterRecall = searchParams.filter_recall === 'true';
  const filterSuggested = searchParams.filter_suggested === 'true';

  const buildMainQuery = (from: number, to: number) => {
    let query = supabase
      .from('patient_summary')
      .select(PATIENT_SUMMARY_COLUMNS);

    if (search) {
      query = query.or(`display_name.ilike.%${search}%,referring_doctor.ilike.%${search}%`);
    }

    if (filterRecall) {
      const today = new Date().toISOString().split('T')[0];
      const thirtyDays = new Date();
      thirtyDays.setDate(thirtyDays.getDate() + 30);
      const thirtyDaysStr = thirtyDays.toISOString().split('T')[0];
      query = query.gte('next_recall_date', today).lte('next_recall_date', thirtyDaysStr);
    }

    if (filterSuggested) {
      query = query.or('suggested_items_count.gt.0,pending_task_count.gt.0');
    }

    if (sort === 'name') {
      query = query.order('display_name', { ascending: true });
    } else if (sort === 'recall') {
      query = query.order('next_recall_date', { ascending: true, nullsFirst: false });
    } else {
      query = query.order('last_seen', { ascending: false, nullsFirst: false });
    }

    // Deterministic tie-breaker so pagination with .range() never skips or duplicates rows
    return query.order('id', { ascending: true }).range(from, to);
  };

  const hasActiveFilter = Boolean(search || filterRecall || filterSuggested);

  const [{ data: patients, error }, { count: totalRecords }, allSummaryRes, initialRoster] = await Promise.all([
    fetchAllPatientSummaries(buildMainQuery),
    // `estimated` is much cheaper than exact full-table counts on larger datasets.
    supabase.from('source_record_cache').select('*', { count: 'estimated', head: true }),
    // Full directory for Today's List matching & selection only when main query is filtered
    hasActiveFilter
      ? fetchAllPatientSummaries((from, to) =>
          supabase
            .from('patient_summary')
            .select(PATIENT_SUMMARY_COLUMNS)
            .order('display_name', { ascending: true })
            .order('id', { ascending: true })
            .range(from, to)
        )
      : Promise.resolve({ data: null, error: null }),
    getTodayRoster()
  ]);

  if (error) {
    return (
      <div className="p-8 text-center text-red-500">
        <h2 className="text-xl font-bold mb-2">Database Connection Error</h2>
        <p>{error.message}</p>
        <p className="text-sm mt-4 text-muted-foreground">
          Did you run the Supabase setup SQL?
        </p>
      </div>
    );
  }

  const allDirectoryPatients = allSummaryRes?.data || (patients ? [...patients].sort((a, b) => a.display_name.localeCompare(b.display_name)) : []);

  return (
    <div className="container mx-auto py-4 md:py-8 px-4">
      {/* Mobile: Stack header vertically. Desktop: Side-by-side */}
      <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-4 mb-6">

        {/* Title Row */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-2">
              <Users className="h-6 w-6 md:h-8 md:w-8" />
              Patient Compiler
            </h1>
            <p className="text-xs text-muted-foreground mt-1 ml-8 md:ml-11 font-mono">
              {totalRecords || 0} records synced
            </p>
          </div>

          {/* Mobile-only clean overflow header */}
          <MobileHeaderActions patients={allDirectoryPatients} />
        </div>

        {/* Desktop: LLM Cost Widget + Actions Row (100% UNCHANGED) */}
        <div className="hidden md:flex items-center gap-4">
          <div className="w-64 h-24">
            <LLMCostDisplay />
          </div>
          <div className="flex items-center gap-2">
            <EndoscopyListDialog patients={allDirectoryPatients} />
            <AddPatientDialog />
            <GlobalSearch />
            <TasksSidebar />
            <Link href="/inbox">
              <Button variant="outline" size="icon" title="Inbox">
                <Inbox className="h-4 w-4" />
              </Button>
            </Link>
            <Link href="/search">
              <Button variant="outline" size="icon" title="Search Everything">
                <Search className="h-4 w-4" />
              </Button>
            </Link>
            <SyncButton />
          </div>
        </div>
      </div>

      <PatientList 
        initialPatients={patients || []} 
        allPatients={allDirectoryPatients}
        initialTodayPatientIds={initialRoster?.patientIds || []}
        initialTodayUpdatedAt={initialRoster?.updatedAt || null}
      />
    </div>
  );
}
