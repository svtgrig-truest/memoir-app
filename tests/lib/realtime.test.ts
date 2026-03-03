import { buildSystemPrompt } from '@/lib/realtime';

describe('buildSystemPrompt', () => {
  it('includes chapter title when provided', () => {
    const prompt = buildSystemPrompt({
      chapterTitle: 'Детство',
      heritageSummary: null,
      sessionSummaries: [],
    });
    expect(prompt).toContain('Детство');
  });

  it('includes heritage summary when provided', () => {
    const prompt = buildSystemPrompt({
      chapterTitle: null,
      heritageSummary: 'Семья из Одессы',
      sessionSummaries: [],
    });
    expect(prompt).toContain('Семья из Одессы');
  });

  it('includes session summaries when provided', () => {
    const prompt = buildSystemPrompt({
      chapterTitle: null,
      heritageSummary: null,
      sessionSummaries: ['Говорили о школе', 'Вспоминали войну'],
    });
    expect(prompt).toContain('Говорили о школе');
    expect(prompt).toContain('Вспоминали войну');
  });

  it('uses free-form context when no chapter title', () => {
    const prompt = buildSystemPrompt({
      chapterTitle: null,
      heritageSummary: null,
      sessionSummaries: [],
    });
    expect(prompt).toContain('следуй за тем');
  });
});
