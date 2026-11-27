import { Redirect } from 'expo-router';
import { useAuth } from '@/lib/auth';

/** Entry: signed in → Home, otherwise Login. */
export default function Index() {
  const { user } = useAuth();
  return <Redirect href={user ? '/home' : '/login'} />;
}
