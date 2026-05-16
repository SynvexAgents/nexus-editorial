import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { WeeklyReportRow } from '../lib/types';

interface UseWeeklyReportResult {
  report: WeeklyReportRow | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

const SELECT =
  'week_id, produced_at, linkedin_trends_json, insurance_trends_json, angles_json, winners_json, visuals_json, timing_json, human_validated, human_notes';

export function useWeeklyReport(weekId: string | undefined): UseWeeklyReportResult {
  const [report, setReport] = useState<WeeklyReportRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchOnce = useCallback(async () => {
    if (!weekId) {
      setReport(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    const { data, error: err } = await supabase
      .from('weekly_reports')
      .select(SELECT)
      .eq('week_id', weekId)
      .maybeSingle();
    if (err) setError(err.message);
    setReport((data as unknown as WeeklyReportRow) ?? null);
    setLoading(false);
  }, [weekId]);

  useEffect(() => {
    void fetchOnce();
  }, [fetchOnce]);

  return { report, loading, error, refresh: fetchOnce };
}
