"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useSession } from "next-auth/react";
import { NotificationPayload, NotificationType, InternalNotificationType } from "@/lib/realtime";

interface UseNotificationsOptions {
  /** Callback appelé à chaque notification reçue */
  onNotification?: (payload: NotificationPayload) => void;
  /** Filtrer par types (optionnel) */
  filterTypes?: (NotificationType | InternalNotificationType)[];
  /** Auto-reconnect (défaut: true) */
  autoReconnect?: boolean;
  /** Délai de reconnexion en ms (défaut: 5000) */
  reconnectDelay?: number;
}

interface UseNotificationsReturn {
  /** Dernière notification reçue */
  lastNotification: NotificationPayload | null;
  /** Toutes les notifications non lues */
  unreadNotifications: NotificationPayload[];
  /** État de connexion */
  isConnected: boolean;
  /** Erreur de connexion */
  error: Error | null;
  /** Marquer une notification comme lue */
  markAsRead: (index: number) => void;
  /** Tout marquer comme lu */
  markAllAsRead: () => void;
  /** Effacer l'historique */
  clearHistory: () => void;
  /** Forcer une reconnexion */
  reconnect: () => void;
}

export function useNotifications(
  options: UseNotificationsOptions = {}
): UseNotificationsReturn {
  const { data: session, status } = useSession();
  const userId = session?.user?.id;

  // Extraire les options pour éviter les problèmes de closure
  const { onNotification, filterTypes, autoReconnect = true, reconnectDelay = 5_000 } = options;

  const [lastNotification, setLastNotification] = useState<NotificationPayload | null>(null);
  const [unreadNotifications, setUnreadNotifications] = useState<NotificationPayload[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttemptsRef = useRef(0);

  // Vérifier si on est côté client avec une session valide
  const isReady = typeof window !== "undefined" && status === "authenticated" && !!userId;

  // Nettoyer à la déconnexion
  const cleanup = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    setIsConnected(false);
  }, []);

  // Traiter un message reçu
  const handleMessage = useCallback(
    (event: MessageEvent) => {
      try {
        const payload = JSON.parse(event.data) as NotificationPayload;

        // Ignorer heartbeat
        if (payload.type === "HEARTBEAT") return;

        // Ignorer CONNECTED
        if (payload.type === "CONNECTED") {
          setIsConnected(true);
          reconnectAttemptsRef.current = 0;
          return;
        }

        // Filtrer par type si configuré
        if (filterTypes && !filterTypes.includes(payload.type as NotificationType | InternalNotificationType)) return;

        setLastNotification(payload);
        setUnreadNotifications((prev) => [payload, ...prev].slice(0, 50)); // Garder max 50

        // Callback optionnel
        onNotification?.(payload);
      } catch {
        // Ignorer messages invalides
      }
    },
    [filterTypes, onNotification]
  );

  // Connexion SSE
  const connect = useCallback(() => {
    if (!isReady) return;
    if (eventSourceRef.current) return; // Déjà connecté

    const eventSource = new EventSource(
      `/api/notifications/stream`,
      { withCredentials: true }
    );
    eventSourceRef.current = eventSource;

    eventSource.onopen = () => {
      setError(null);
      reconnectAttemptsRef.current = 0;
    };

    eventSource.onmessage = handleMessage;

    eventSource.onerror = (err) => {
      setError(new Error("Connexion SSE perdue"));
      setIsConnected(false);
      cleanup();

      if (autoReconnect && reconnectAttemptsRef.current < 10) {
        const delay = reconnectDelay * Math.pow(1.5, reconnectAttemptsRef.current);
        reconnectTimeoutRef.current = setTimeout(() => {
          reconnectAttemptsRef.current++;
          connect();
        }, delay);
      }
    };
  }, [isReady, autoReconnect, reconnectDelay, handleMessage]);

  // Reconnexion manuelle
  const reconnect = useCallback(() => {
    cleanup();
    reconnectAttemptsRef.current = 0;
    connect();
  }, [cleanup, connect]);

  // Marquer comme lu
  const markAsRead = useCallback((index: number) => {
    setUnreadNotifications((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const markAllAsRead = useCallback(() => {
    setUnreadNotifications([]);
  }, []);

  const clearHistory = useCallback(() => {
    setUnreadNotifications([]);
    setLastNotification(null);
  }, []);

  // Connexion initiale
  useEffect(() => {
    if (isReady) {
      connect();
    } else if (status === "unauthenticated") {
      cleanup();
    }

    return cleanup;
  }, [isReady, status, connect, cleanup]);

  // Cleanup au démontage
  useEffect(() => {
    return () => {
      cleanup();
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };
  }, [cleanup]);

  return {
    lastNotification,
    unreadNotifications,
    isConnected,
    error,
    markAsRead,
    markAllAsRead,
    clearHistory,
    reconnect,
  };
}