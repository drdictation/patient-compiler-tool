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

export const dynamic = 'force-dynamic';

interface DashboardProps {
  searchParams: Promise<{
    search?: string;
    sort?: string;
    filter_recall?: string;
    filter_suggested?: string;
  }>;
}

export default async function Dashboard(props: DashboardProps) {
  const searchParams = await props.searchParams;
  const search = searchParams.search || '';
  const sort = searchParams.sort || 'last_seen'; // 'name', 'last_seen', 'recall'
  const filterRecall = searchParams.filter_recall === 'true';
  const filterSuggested = searchParams.filter_suggested === 'true';

  // Build Query
  let query = supabase
    .from('patient_summary')
    .select(`
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
    `);

  // 1. Search (Name or Referring Doctor)
  if (search) {
    // Note: 'or' syntax in Supabase is allowing search across multiple columns
    // We need to ensure text search configuration or simple ilike
    query = query.or(`display_name.ilike.%${search}%,referring_doctor.ilike.%${search}%`);
  }

  // 2. Filters
  if (filterRecall) {
    const today = new Date().toISOString().split('T')[0];
    const thirtyDays = new Date();
    thirtyDays.setDate(thirtyDays.getDate() + 30);
    const thirtyDaysStr = thirtyDays.toISOString().split('T')[0];

    // next_recall_date between Today and 30 days from now
    query = query.gte('next_recall_date', today).lte('next_recall_date', thirtyDaysStr);
  }

  if (filterSuggested) {
    query = query.or('suggested_items_count.gt.0,pending_task_count.gt.0');
  }

  // 3. Sorting
  if (sort === 'name') {
    query = query.order('display_name', { ascending: true });
  } else if (sort === 'recall') {
    // Ascending because we want "Soonest" first, but NULLS LAST
    query = query.order('next_recall_date', { ascending: true, nullsFirst: false });
  } else {
    // Default: Last Seen (Recent First)
    query = query.order('last_seen', { ascending: false });
  }

  const [{ data: patients, error }, { count: totalRecords }] = await Promise.all([
    query,
    // `estimated` is much cheaper than exact full-table counts on larger datasets.
    supabase.from('source_record_cache').select('*', { count: 'estimated', head: true }),
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

          {/* Mobile-only compact action buttons */}
          <div className="flex gap-2 md:hidden">
            <AddPatientDialog />
            <GlobalSearch />
            <TasksSidebar />
            <Link href="/inbox">
              <Button variant="outline" size="icon" title="Inbox">
                <Inbox className="h-4 w-4" />
              </Button>
            </Link>
            <Link href="/search">
              <Button variant="outline" size="icon" title="Search">
                <Search className="h-4 w-4" />
              </Button>
            </Link>
            <SyncButton />
          </div>
        </div>

        {/* Desktop: LLM Cost Widget + Actions Row */}
        <div className="hidden md:flex items-center gap-4">
          <div className="w-64 h-24">
            <LLMCostDisplay />
          </div>
          <div className="flex items-center gap-2">
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

      <PatientList initialPatients={patients || []} />
    </div>
  );
}
