'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getCurrentUser } from '@/lib/api';

export default function HomePage() {
  const router = useRouter();

  useEffect(() => {
    const user = getCurrentUser<{ role: string }>();
    if (!user) {
      router.push('/login');
    } else if (user.role === 'SUPER_ADMIN') {
      router.push('/admin/dashboard');
    } else {
      router.push('/dashboard');
    }
  }, []);

  return <div className="p-8 text-center text-gray-500">Chargement...</div>;
}
