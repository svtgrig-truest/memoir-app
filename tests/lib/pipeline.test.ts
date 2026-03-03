import { buildRawTranscript, buildPolishPrompt, buildTagPrompt, buildSummaryPrompt } from '@/lib/pipeline';

describe('buildRawTranscript', () => {
  it('formats assistant turns as Интервьюер', () => {
    const result = buildRawTranscript([{ role: 'assistant', text: 'Расскажи о детстве.' }]);
    expect(result).toContain('Интервьюер: Расскажи о детстве.');
  });

  it('formats user turns as Папа', () => {
    const result = buildRawTranscript([{ role: 'user', text: 'Я родился в Москве.' }]);
    expect(result).toContain('Папа: Я родился в Москве.');
  });

  it('joins multiple turns with double newline', () => {
    const result = buildRawTranscript([
      { role: 'assistant', text: 'Вопрос?' },
      { role: 'user', text: 'Ответ.' },
    ]);
    expect(result).toBe('Интервьюер: Вопрос?\n\nПапа: Ответ.');
  });
});

describe('buildPolishPrompt', () => {
  it('includes the raw transcript in the prompt', () => {
    const prompt = buildPolishPrompt('Папа: Я родился в Москве.');
    expect(prompt).toContain('Папа: Я родился в Москве.');
  });
});

describe('buildTagPrompt', () => {
  it('includes chapter titles in the prompt', () => {
    const prompt = buildTagPrompt('Говорил о школе.', ['Детство', 'Юность']);
    expect(prompt).toContain('Детство');
    expect(prompt).toContain('Юность');
  });
});

describe('buildSummaryPrompt', () => {
  it('includes transcript content in the prompt', () => {
    const prompt = buildSummaryPrompt('Папа говорил о войне.');
    expect(prompt).toContain('Папа говорил о войне.');
  });
});
