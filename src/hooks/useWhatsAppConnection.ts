import { useState, useRef, useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import {
  QR_LOADING_STAGES,
  MAX_CREATION_WAIT_MS,
  CREATION_POLL_INTERVAL_MS,
  STATUS_POLL_INTERVAL_MS,
  QR_REFRESH_INTERVAL_MS,
} from '@/constants/whatsapp';

export type ConnectionStatus =
  | 'loading'
  | 'no_instance'
  | 'creating'
  | 'waiting_scan'
  | 'connected'
  | 'error';

interface UseWhatsAppConnectionOptions {
  childId: string;
  onConnected?: () => void;
  autoInitialize?: boolean;
}

interface UseWhatsAppConnectionReturn {
  status: ConnectionStatus;
  qrCode: string | null;
  errorMessage: string | null;
  creationProgress: number;
  qrLoadingProgress: number;
  qrLoadingStage: number;
  createInstance: () => Promise<void>;
  fetchQR: () => Promise<void>;
  checkStatus: () => Promise<boolean>;
  clearIntervals: () => void;
  startQrLoadingAnimation: () => void;
  stopQrLoadingAnimation: () => void;
}

export function useWhatsAppConnection({
  childId,
  onConnected,
  autoInitialize = false,
}: UseWhatsAppConnectionOptions): UseWhatsAppConnectionReturn {
  const [status, setStatus] = useState<ConnectionStatus>('loading');
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [creationProgress, setCreationProgress] = useState(0);
  const [qrLoadingProgress, setQrLoadingProgress] = useState(0);
  const [qrLoadingStage, setQrLoadingStage] = useState(0);

  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const qrRefreshIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const creationTimerRef = useRef<NodeJS.Timeout | null>(null);
  const qrLoadingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const isFetchingRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const isInitializedRef = useRef(false);

  const clearIntervals = useCallback(() => {
    [pollIntervalRef, qrRefreshIntervalRef, creationTimerRef, qrLoadingIntervalRef].forEach((ref) => {
      if (ref.current) {
        clearInterval(ref.current);
        ref.current = null;
      }
    });
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
  }, []);

  const startQrLoadingAnimation = useCallback(() => {
    setQrLoadingProgress(0);
    setQrLoadingStage(0);

    let stageIndex = 0;
    qrLoadingIntervalRef.current = setInterval(() => {
      if (stageIndex < QR_LOADING_STAGES.length - 1) {
        stageIndex++;
        setQrLoadingStage(stageIndex);
        setQrLoadingProgress(QR_LOADING_STAGES[stageIndex].progress);
      }
    }, 800);
  }, []);

  const stopQrLoadingAnimation = useCallback(() => {
    if (qrLoadingIntervalRef.current) {
      clearInterval(qrLoadingIntervalRef.current);
      qrLoadingIntervalRef.current = null;
    }
    setQrLoadingProgress(100);
  }, []);

  const checkStatus = useCallback(async (): Promise<boolean> => {
    if (isFetchingRef.current) return false;
    isFetchingRef.current = true;

    try {
      const { data, error } = await supabase.functions.invoke('green-api-partner', {
        body: { action: 'getStatus', child_id: childId },
      });

      if (error) throw error;

      if (!data.hasInstance) {
        setStatus('no_instance');
        clearIntervals();
        return false;
      }

      if (data.status === 'authorized') {
        setStatus('connected');
        setQrCode(null);
        clearIntervals();
        toast.success('WhatsApp מחובר בהצלחה!');
        onConnected?.();
        return true;
      }

      return false;
    } catch (error) {
      console.error('Status check error:', error);
      return false;
    } finally {
      isFetchingRef.current = false;
    }
  }, [childId, clearIntervals, onConnected]);

  const fetchQR = useCallback(async () => {
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;

    try {
      setErrorMessage(null);

      const { data, error } = await supabase.functions.invoke('green-api-qr', {
        body: { action: 'qr', child_id: childId },
      });

      if (error) throw error;

      if (data.type === 'noInstance') {
        setStatus('no_instance');
        clearIntervals();
        stopQrLoadingAnimation();
        return;
      }

      // Instance is still initializing or server busy - keep waiting
      if (data.notReady || data.retryable || data.rateLimited) {
        console.log('Instance initializing or server busy, waiting...');
        return;
      }

      // Handle other errors gracefully
      if (data.type === 'error' && !data.message?.includes('already')) {
        console.log('QR fetch error, will retry:', data.message);
        return;
      }

      if (data.type === 'qrCode' && data.message) {
        stopQrLoadingAnimation();
        setQrCode(data.message);
        setStatus('waiting_scan');
      } else if (data.type === 'alreadyLogged') {
        stopQrLoadingAnimation();
        setStatus('connected');
        setQrCode(null);
        clearIntervals();
        toast.success('WhatsApp מחובר בהצלחה!');
        onConnected?.();
      }
    } catch (error) {
      console.error('QR fetch error:', error);
    } finally {
      isFetchingRef.current = false;
    }
  }, [childId, clearIntervals, onConnected, stopQrLoadingAnimation]);

  const startPolling = useCallback(() => {
    // Poll for status
    pollIntervalRef.current = setInterval(async () => {
      const connected = await checkStatus();
      if (connected) clearIntervals();
    }, STATUS_POLL_INTERVAL_MS);

    // Refresh QR
    qrRefreshIntervalRef.current = setInterval(fetchQR, QR_REFRESH_INTERVAL_MS);
  }, [checkStatus, fetchQR, clearIntervals]);

  const createInstance = useCallback(async () => {
    setStatus('creating');
    setErrorMessage(null);
    setCreationProgress(0);

    const startTime = Date.now();
    abortControllerRef.current = new AbortController();

    // Smooth progress animation
    const progressInterval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min((elapsed / MAX_CREATION_WAIT_MS) * 85, 85);
      setCreationProgress(progress);
    }, 100);
    creationTimerRef.current = progressInterval;

    try {
      const { data, error } = await supabase.functions.invoke('green-api-partner', {
        body: { action: 'createInstance', child_id: childId },
      });

      if (error) throw error;
      if (data.error) throw new Error(data.error);

      if (data.status === 'already_connected') {
        clearInterval(progressInterval);
        creationTimerRef.current = null;
        setCreationProgress(100);
        toast.success('WhatsApp כבר מחובר!');
        setStatus('connected');
        onConnected?.();
        return;
      }

      // Poll for instance readiness
      let isReady = false;
      const pollStartTime = Date.now();

      while (
        !isReady &&
        Date.now() - pollStartTime < MAX_CREATION_WAIT_MS &&
        !abortControllerRef.current?.signal.aborted
      ) {
        await new Promise((resolve) => setTimeout(resolve, CREATION_POLL_INTERVAL_MS));

        try {
          const { data: statusData } = await supabase.functions.invoke('green-api-partner', {
            body: { action: 'getStatus', child_id: childId },
          });

          if (statusData?.hasInstance && statusData?.stateInstance) {
            isReady = true;
            setCreationProgress(95);
          }
        } catch (e) {
          console.log('Status check during creation:', e);
        }
      }

      clearInterval(progressInterval);
      creationTimerRef.current = null;
      setCreationProgress(100);

      toast.success('מופע נוצר בהצלחה! מחכה לסריקת QR...');

      setStatus('waiting_scan');
      startQrLoadingAnimation();
      fetchQR();
      startPolling();
    } catch (error: any) {
      clearInterval(progressInterval);
      creationTimerRef.current = null;
      console.error('Create instance error:', error);
      setErrorMessage(error.message || 'שגיאה ביצירת מופע');
      setStatus('error');
      toast.error('שגיאה ביצירת חיבור: ' + error.message);
    }
  }, [childId, onConnected, startQrLoadingAnimation, fetchQR, startPolling]);

  // Auto-initialize if enabled
  useEffect(() => {
    if (!autoInitialize || isInitializedRef.current) return;
    isInitializedRef.current = true;

    const initialize = async () => {
      setStatus('loading');
      clearIntervals();

      const isConnected = await checkStatus();

      if (!isConnected) {
        const { data } = await supabase.functions.invoke('green-api-partner', {
          body: { action: 'getStatus', child_id: childId },
        });

        if (data?.hasInstance) {
          setStatus('waiting_scan');
          startQrLoadingAnimation();
          fetchQR();
          startPolling();
        } else {
          setStatus('no_instance');
        }
      }
    };

    initialize();

    return () => clearIntervals();
  }, [autoInitialize, childId, checkStatus, fetchQR, clearIntervals, startQrLoadingAnimation, startPolling]);

  return {
    status,
    qrCode,
    errorMessage,
    creationProgress,
    qrLoadingProgress,
    qrLoadingStage,
    createInstance,
    fetchQR,
    checkStatus,
    clearIntervals,
    startQrLoadingAnimation,
    stopQrLoadingAnimation,
  };
}
