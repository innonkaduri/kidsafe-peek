import { useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

const SYNC_INTERVAL_MS = 60000; // Sync every 60 seconds (increased to reduce duplicates)
const MIN_SYNC_GAP_MS = 30000; // Minimum 30 seconds between syncs

export function useBackgroundSync() {
  const { user } = useAuth();
  const syncIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const isSyncingRef = useRef(false);
  const lastSyncTimeRef = useRef<number>(0);
  const syncAllChildren = useCallback(async () => {
    if (!user || isSyncingRef.current) return;
    
    // Prevent syncing too frequently (protects against multiple tabs/windows)
    const now = Date.now();
    if (now - lastSyncTimeRef.current < MIN_SYNC_GAP_MS) {
      console.log('Background sync: Skipping - last sync was less than 30s ago');
      return;
    }
    
    isSyncingRef.current = true;
    lastSyncTimeRef.current = now;
    
    try {
      // Get all children with connected WhatsApp instances
      // Check for both 'connected' and 'authorized' statuses
      const { data: credentials, error: credError } = await supabase
        .from('connector_credentials')
        .select('child_id, status')
        .in('status', ['connected', 'authorized']);
      
      if (credError) {
        console.error('Background sync: Error fetching credentials:', credError);
        return;
      }
      
      if (!credentials || credentials.length === 0) {
        return; // No connected instances
      }
      
      // Get children that belong to this user
      const childIds = credentials.map(c => c.child_id).filter(Boolean);
      
      const { data: children, error: childError } = await supabase
        .from('children')
        .select('id')
        .eq('user_id', user.id)
        .in('id', childIds);
      
      if (childError) {
        console.error('Background sync: Error fetching children:', childError);
        return;
      }
      
      if (!children || children.length === 0) {
        return; // No children with connected WhatsApp for this user
      }
      
      // Sync messages for each connected child
      for (const child of children) {
        try {
          const { data, error } = await supabase.functions.invoke('green-api-fetch', {
            body: { child_id: child.id },
          });
          
          if (error) {
            console.error(`Background sync: Error syncing child ${child.id}:`, error);
          } else if (data.messagesImported > 0) {
            console.log(`Background sync: Synced ${data.messagesImported} messages for child ${child.id}`);
          }
        } catch (err) {
          console.error(`Background sync: Exception syncing child ${child.id}:`, err);
        }
      }
    } catch (err) {
      console.error('Background sync: General error:', err);
    } finally {
      isSyncingRef.current = false;
    }
  }, [user]);

  useEffect(() => {
    if (!user) {
      // Clear interval when user logs out
      if (syncIntervalRef.current) {
        clearInterval(syncIntervalRef.current);
        syncIntervalRef.current = null;
      }
      return;
    }

    // Sync immediately on login
    syncAllChildren();

    // Set up recurring sync
    syncIntervalRef.current = setInterval(syncAllChildren, SYNC_INTERVAL_MS);

    return () => {
      if (syncIntervalRef.current) {
        clearInterval(syncIntervalRef.current);
        syncIntervalRef.current = null;
      }
    };
  }, [user, syncAllChildren]);

  return { syncNow: syncAllChildren };
}
