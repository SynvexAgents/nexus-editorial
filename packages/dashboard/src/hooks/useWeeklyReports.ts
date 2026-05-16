import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { WeeklyReportRow } from '../lib/types';

interface UseWeeklyReportsResult {
  reports: WeeklyReportRow[];
  loading: boolean;
  error: string | null;
}

export function useWeeklyReports(limit = 10): UseWeeklyReportsResult {
  const [reports, setReports] = useState<WeeklyReportRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    setError(null);
    void supabase
      .from('weekly_reports')
      .select(
        'week_id, produced_at, linkedin_trends_json, insurance_trends_json, angles_json, winners_json, visuals_json, timing_json, human_validated, human_notes',
      )
      .order('produced_at', { ascending: false, nullsFirst: false })
      .limit(limit)
      .then(({ data, error: err }) => {
        if (!mounted) return;
        if (err) setError(err.message);
        else setReports((data ?? []) as unknown as WeeklyReportRow[]);
        setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [limit]);

  return { reports, loading, error };
}
