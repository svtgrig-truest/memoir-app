'use client';
import * as Dialog from '@radix-ui/react-dialog';
import { Chapter } from '@/types';
import { X, Plus, Menu } from 'lucide-react';

interface Props {
  chapters: Chapter[];
  completedIds: Set<string>;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}

export function ChapterSidebar({ chapters, completedIds, selectedId, onSelect }: Props) {
  return (
    <Dialog.Root>
      <Dialog.Trigger asChild>
        <button
          className="p-3 text-white/70 hover:text-white transition-colors"
          aria-label="Открыть меню глав"
        >
          <Menu className="w-6 h-6" />
        </button>
      </Dialog.Trigger>

      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40" />
        <Dialog.Content className="fixed left-0 top-0 h-full w-72 bg-zinc-900 text-white p-6 flex flex-col shadow-2xl z-50 outline-none">
          <div className="flex items-center justify-between mb-8">
            <Dialog.Title className="text-lg font-semibold">Мои воспоминания</Dialog.Title>
            <Dialog.Close asChild>
              <button className="text-white/50 hover:text-white transition-colors" aria-label="Закрыть">
                <X className="w-5 h-5" />
              </button>
            </Dialog.Close>
          </div>

          <nav className="flex-1 space-y-1 overflow-y-auto">
            <Dialog.Close asChild>
              <button
                onClick={() => onSelect(null)}
                className={`w-full text-left px-4 py-3 rounded-xl text-base transition-colors ${
                  selectedId === null ? 'bg-white/10 text-white' : 'text-white/60 hover:text-white hover:bg-white/5'
                }`}
              >
                Свободный разговор
              </button>
            </Dialog.Close>
            {chapters.map((ch) => (
              <Dialog.Close asChild key={ch.id}>
                <button
                  onClick={() => onSelect(ch.id)}
                  className={`w-full text-left px-4 py-3 rounded-xl text-base flex items-center justify-between transition-colors ${
                    selectedId === ch.id ? 'bg-white/10 text-white' : 'text-white/60 hover:text-white hover:bg-white/5'
                  }`}
                >
                  <span>{ch.title_ru}</span>
                  {completedIds.has(ch.id) && (
                    <span className="text-blue-400 text-xs ml-2">✓</span>
                  )}
                </button>
              </Dialog.Close>
            ))}
          </nav>

          {/* TODO Task 5: wire to session pipeline to create custom chapter */}
          <button
            type="button"
            className="mt-6 flex items-center gap-2 text-white/40 hover:text-white/70 text-sm transition-colors"
          >
            <Plus className="w-4 h-4" /> Новая тема
          </button>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
