import { useRoute } from '@react-navigation/native';

import { EmptyState } from '@/ui/EmptyState';
import { Screen } from '@/ui/Screen';

/**
 * TEMPORARY stand-in for every route whose real screen lands in FEAT-004/005.
 * FEAT-005 deletes this file so typecheck fails if any route still references it.
 */
export function PlaceholderScreen() {
  const route = useRoute();
  return (
    <Screen edges={['left', 'right']}>
      <EmptyState icon="hammer-wrench" title={route.name} body="This screen is coming soon." />
    </Screen>
  );
}
