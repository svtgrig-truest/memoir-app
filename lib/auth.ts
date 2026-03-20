import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

export async function requireAuth() {
  const cookieStore = await cookies();
  if (!cookieStore.get('app_auth')?.value) {
    redirect('/login');
  }
}
