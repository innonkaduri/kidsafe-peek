import { useBackgroundSync } from '@/hooks/useBackgroundSync';

// This component runs background sync for WhatsApp messages
// It doesn't render anything, just runs the sync logic
export function BackgroundSync() {
  useBackgroundSync();
  return null;
}
