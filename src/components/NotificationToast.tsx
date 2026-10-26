"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useNotifications } from "@/hooks/useNotifications";
import { NotificationPayload } from "@/lib/realtime";
import dynamic from "next/dynamic";

/** Wrapper client-only pour éviter le SSR - import dynamique avec ssr: false */
const NotificationToast = dynamic(
  () => import("./NotificationToastInner").then((mod) => mod.default),
  { ssr: false, loading: () => null }
);

/** Composant interne qui gère la file de notifications (client-only) */
export function NotificationProviderInner() {
  const [mounted, setMounted] = useState(false);
  const mountedRef = useRef(mounted);
  const { unreadNotifications, markAsRead } = useNotifications();
  const [toasts, setToasts] = useState<NotificationPayload[]>([]);
  const toastsRef = useRef(toasts);

  useEffect(() => {
    toastsRef.current = toasts;
  }, [toasts]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
    mountedRef.current = true;
  }, []);

  // Synchroniser avec les notifications non lues
  useEffect(() => {
    if (!mountedRef.current) return;
    // Ajouter les nouvelles notifications qui ne sont pas encore affichées
    for (const notif of unreadNotifications) {
      if (!toastsRef.current.some((t) => t.type === notif.type && t.message === notif.message && t.dossierId === notif.dossierId)) {
        setToasts((prev) => [notif, ...prev].slice(0, 5)); // Max 5 toasts
      }
    }
  }, [unreadNotifications]);

  const handleClose = useCallback((notif: NotificationPayload) => {
    setToasts((prev) => prev.filter((t) => t !== notif));
    markAsRead(unreadNotifications.findIndex((n) => n === notif));
  }, [markAsRead]);

  if (!mounted) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col-reverse gap-2 pointer-events-none">
      {toasts.map((notif, index) => (
        <NotificationToast
          key={`${notif.type}-${notif.dossierId}-${index}`}
          notification={notif}
          onClose={() => handleClose(notif)}
        />
      ))}
    </div>
  );
}

/** Wrapper client-only pour éviter le SSR - import dynamique avec ssr: false */
export const NotificationProvider = dynamic(
  () => import("./NotificationToast").then((mod) => mod.NotificationProviderInner),
  { ssr: false, loading: () => null }
);