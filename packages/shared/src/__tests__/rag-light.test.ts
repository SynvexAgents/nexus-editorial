import { describe, expect, it } from 'vitest';
import {
  type MeasuredPostRow,
  buildRagPromptFragment,
  decideRag,
  scoreComposite,
  sortByComposite,
} from '../rag-light.js';

function row(over: Partial<MeasuredPostRow> = {}): MeasuredPostRow {
  return {
    post_id: `p-${Math.random().toString(36).slice(2, 8)}`,
    archetype: 'constat_lucide',
    icp: 'courtier',
    length_target: 'medium',
    hook_excerpt: "L'audit trail est devenu le passeport délégation",
    first_paragraph: 'Sur 12 cabinets accompagnés ce trimestre, 9 ne tiennent pas le contrôle.',
    likes: 0,
    comments: 0,
    reposts: 0,
    measured_at: '2026-05-19T00:00:00Z',
    ...over,
  };
}

describe('scoreComposite — likes + 3×comments + 5×reposts', () => {
  it('compute the documented weighted sum', () => {
    expect(scoreComposite({ likes: 50, comments: 10, reposts: 2 })).toBe(50 + 30 + 10); // 90
    expect(scoreComposite({ likes: 80, comments: 2, reposts: 0 })).toBe(80 + 6 + 0); // 86
    expect(scoreComposite({ likes: 0, comments: 0, reposts: 5 })).toBe(25);
  });

  it('orders posts so comments and reposts can flip a likes-led row', () => {
    const a = row({ likes: 50, comments: 10, reposts: 2 }); // composite 90
    const b = row({ likes: 80, comments: 2, reposts: 0 }); // composite 86
    const sorted = sortByComposite([b, a]);
    expect(sorted[0]).toBe(a);
    expect(sorted[1]).toBe(b);
  });
});

describe('decideRag — palier disabled (n < 5)', () => {
  it('returns disabled_insufficient_data with empty fragment for n=0', () => {
    const r = decideRag([]);
    expect(r.status).toBe('disabled_insufficient_data');
    expect(r.measured_posts_count).toBe(0);
    expect(r.top_performers).toEqual([]);
    expect(r.prompt_fragment).toBe('');
  });

  it('returns disabled_insufficient_data for n=3 (palier 1)', () => {
    const r = decideRag([row(), row(), row()]);
    expect(r.status).toBe('disabled_insufficient_data');
    expect(r.measured_posts_count).toBe(3);
    expect(r.prompt_fragment).toBe('');
  });

  it('returns disabled_insufficient_data for n=4 exactly (floor exclusif)', () => {
    const r = decideRag([row(), row(), row(), row()]);
    expect(r.status).toBe('disabled_insufficient_data');
    expect(r.prompt_fragment).toBe('');
  });
});

describe('decideRag — palier light (5 ≤ n < 10)', () => {
  it('activates light_mode at n=5 with 3 top performers in fragment', () => {
    const rows: MeasuredPostRow[] = [
      row({ likes: 10, comments: 1, reposts: 0 }), // composite 13
      row({ likes: 100, comments: 20, reposts: 5 }), // composite 185
      row({ likes: 50, comments: 5, reposts: 1 }), // composite 70
      row({ likes: 30, comments: 0, reposts: 0 }), // composite 30
      row({ likes: 200, comments: 10, reposts: 10 }), // composite 280
    ];
    const r = decideRag(rows);
    expect(r.status).toBe('light_mode_limited_data');
    expect(r.measured_posts_count).toBe(5);
    expect(r.top_performers).toHaveLength(3);
    // Sorted desc by composite : 280, 185, 70
    expect(r.top_performers[0]?.likes).toBe(200);
    expect(r.top_performers[1]?.likes).toBe(100);
    expect(r.top_performers[2]?.likes).toBe(50);
    expect(r.prompt_fragment).toContain('DONNÉES TERRAIN (limitées, 5-9 posts publiés)');
    expect(r.prompt_fragment).toContain('[POST 1]');
    expect(r.prompt_fragment).toContain('[POST 3]');
    expect(r.prompt_fragment).not.toContain('[POST 4]');
  });

  it('caps top_performers at 3 even for n=9', () => {
    const rows = Array.from({ length: 9 }, (_, i) => row({ likes: i + 1 }));
    const r = decideRag(rows);
    expect(r.status).toBe('light_mode_limited_data');
    expect(r.top_performers).toHaveLength(3);
  });
});

describe('decideRag — palier full (n ≥ 10)', () => {
  it('activates full_mode at n=10 with 5 top performers', () => {
    const rows = Array.from({ length: 10 }, (_, i) => row({ likes: i + 1 }));
    const r = decideRag(rows);
    expect(r.status).toBe('full_mode');
    expect(r.measured_posts_count).toBe(10);
    expect(r.top_performers).toHaveLength(5);
    expect(r.prompt_fragment).toContain('DONNÉES TERRAIN (5 top performers)');
    expect(r.prompt_fragment).toContain('[POST 5]');
    expect(r.prompt_fragment).not.toContain('[POST 6]');
  });

  it('still caps at 5 even with 50 measured posts', () => {
    const rows = Array.from({ length: 50 }, (_, i) => row({ likes: i + 1 }));
    const r = decideRag(rows);
    expect(r.status).toBe('full_mode');
    expect(r.top_performers).toHaveLength(5);
    // Top 5 must be the highest likes (since comments/reposts are 0)
    expect(r.top_performers.map((p) => p.likes)).toEqual([50, 49, 48, 47, 46]);
  });
});

describe('buildRagPromptFragment — formatting', () => {
  it('disabled returns empty string', () => {
    expect(buildRagPromptFragment('disabled_insufficient_data', [])).toBe('');
  });

  it('light fragment contains the "données limitées" footer', () => {
    const r = decideRag([
      row({ likes: 50, comments: 5, reposts: 1 }),
      row({ likes: 40, comments: 3, reposts: 0 }),
      row({ likes: 30, comments: 2, reposts: 0 }),
      row({ likes: 20, comments: 1, reposts: 0 }),
      row({ likes: 10, comments: 0, reposts: 0 }),
    ]);
    expect(r.status).toBe('light_mode_limited_data');
    expect(r.prompt_fragment).toMatch(/moins de 10 posts/i);
  });

  it('full fragment does NOT carry the "limited" footer', () => {
    const r = decideRag(Array.from({ length: 12 }, () => row({ likes: 100 })));
    expect(r.status).toBe('full_mode');
    expect(r.prompt_fragment).not.toMatch(/moins de 10 posts/i);
  });

  it('embeds archetype, icp, longueur, hook, premier_paragraphe', () => {
    const r = decideRag([
      row({ archetype: 'these_marche', icp: 'MGA', length_target: 'long', likes: 200 }),
      ...Array.from({ length: 9 }, () => row({ likes: 1 })),
    ]);
    expect(r.status).toBe('full_mode');
    expect(r.prompt_fragment).toContain('archetype=these_marche');
    expect(r.prompt_fragment).toContain('icp=MGA');
    expect(r.prompt_fragment).toContain('longueur=long');
    expect(r.prompt_fragment).toContain('hook=');
    expect(r.prompt_fragment).toContain('premier_paragraphe=');
  });
});
