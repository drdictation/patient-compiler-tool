
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { SyncButton } from '@/components/sync-button';
import { Button } from '@/components/ui/button';
import { Users, Search } from 'lucide-react';
import { PatientList } from '@/components/patient-list';
import { AddPatientDialog } from '@/components/add-patient-dialog';
import { LLMCostDisplay } from '@/components/llm-cost-display';

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
  let query = supabase.from('patient_summary').select('*');

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
    query = query.gt('suggested_items_count', 0);
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

  const { data: patients, error } = await query;

  // Fetch total system count for verification
  const { count: totalRecords } = await supabase
    .from('source_record_cache')
    .select('*', { count: 'exact', head: true });

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
    <div className="container mx-auto py-8 px-4">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Users className="h-8 w-8" />
            Patient Compiler
          </h1>
          <p className="text-xs text-muted-foreground mt-1 ml-11 font-mono">
            Total Records Synced: {totalRecords || 0}
          </p>
        </div>

        <div className="w-64 h-24 hidden md:block">
          <LLMCostDisplay />
        </div>

        <div className="flex gap-2">
          <AddPatientDialog />
          <Link href="/search">
            <Button variant="outline" size="icon" title="Search Everything">
              <Search className="h-4 w-4" />
            </Button>
          </Link>
          <SyncButton />
        </div>
      </div>

      <PatientList initialPatients={patients || []} />
    </div>
  );
}
