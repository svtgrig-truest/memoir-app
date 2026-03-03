import { render, screen, fireEvent } from '@testing-library/react';
import { VoiceOrb } from '@/components/VoiceOrb';

describe('VoiceOrb', () => {
  it('renders a button', () => {
    render(<VoiceOrb state="idle" onClick={() => {}} />);
    expect(screen.getByRole('button')).toBeInTheDocument();
  });

  it('calls onClick when clicked', () => {
    const onClick = vi.fn();
    render(<VoiceOrb state="idle" onClick={onClick} />);
    fireEvent.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
