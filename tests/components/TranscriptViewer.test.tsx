import { render, screen, fireEvent } from '@testing-library/react';
import { TranscriptViewer } from '@/components/TranscriptViewer';

const RAW = 'Raw transcript text here.';
const POLISHED = 'Polished memoir text here.';

describe('TranscriptViewer', () => {
  it('renders both raw and polished text by default (split view)', () => {
    render(<TranscriptViewer rawText={RAW} polishedText={POLISHED} />);
    expect(screen.getByText(RAW)).toBeInTheDocument();
    expect(screen.getByText(POLISHED)).toBeInTheDocument();
  });

  it('shows only raw text when Транскрипт button is clicked', () => {
    render(<TranscriptViewer rawText={RAW} polishedText={POLISHED} />);
    fireEvent.click(screen.getByText('Транскрипт'));
    expect(screen.getByText(RAW)).toBeInTheDocument();
    expect(screen.queryByText(POLISHED)).not.toBeInTheDocument();
  });

  it('shows only polished text when Мемуар button is clicked', () => {
    render(<TranscriptViewer rawText={RAW} polishedText={POLISHED} />);
    fireEvent.click(screen.getByText('Мемуар'));
    expect(screen.getByText(POLISHED)).toBeInTheDocument();
    expect(screen.queryByText(RAW)).not.toBeInTheDocument();
  });
});
