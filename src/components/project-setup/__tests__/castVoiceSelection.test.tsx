import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CastTab } from '../CastTab';
import type { Character } from '../types';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    functions: { invoke: () => Promise.resolve({ data: null, error: null }) },
    channel: () => ({ on: () => ({ subscribe: () => ({}) }), subscribe: () => ({}) }),
    removeChannel: () => {},
    from: () => ({ select: () => ({ eq: () => Promise.resolve({ data: [], error: null }) }) }),
  },
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

const characters: Character[] = [
  { id: 'char-1', name: 'Ada', description: 'A keeper' },
  { id: 'char-2', name: 'Basil', description: 'A sailor' },
];

const card = (id: string) => document.querySelector(`[data-voice-character-id="${id}"]`)!;

describe('cast voice selection', () => {
  it('selects a character for voice commands when its card is clicked', () => {
    const onSelectCharacter = vi.fn();
    render(
      <CastTab
        characters={characters}
        scenes={[]}
        onAddCharacter={vi.fn()}
        onDeleteCharacter={vi.fn()}
        isCharacterSelected={() => false}
        onSelectCharacter={onSelectCharacter}
      />,
    );

    (card('char-2') as HTMLElement).click();
    expect(onSelectCharacter).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'char-2', name: 'Basil' }),
    );
  });

  it('shows the voice-selected ring on the selected character only', () => {
    render(
      <CastTab
        characters={characters}
        scenes={[]}
        onAddCharacter={vi.fn()}
        onDeleteCharacter={vi.fn()}
        isCharacterSelected={(character) => character.id === 'char-1'}
        onSelectCharacter={vi.fn()}
      />,
    );

    expect(card('char-1').className).toContain('ring-accent-ember/50');
    expect(card('char-2').className).not.toContain('ring-accent-ember/50');
  });

  it('stays inert when no selection wiring is provided', () => {
    render(
      <CastTab
        characters={characters}
        scenes={[]}
        onAddCharacter={vi.fn()}
        onDeleteCharacter={vi.fn()}
      />,
    );

    expect(card('char-1').className).not.toContain('cursor-pointer');
    expect(screen.getByText('Ada')).toBeInTheDocument();
  });
});
