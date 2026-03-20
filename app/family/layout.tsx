import type { ReactNode } from 'react';
import { requireAuth } from '@/lib/auth';

export default async function FamilyLayout({ children }: { children: ReactNode }) {
  await requireAuth();
  return <>{children}</>;
}
