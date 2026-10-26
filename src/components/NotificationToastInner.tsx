"use client";

import { useState, useEffect, useCallback } from "react";
import { X, Bell, CheckCircle, AlertCircle, Info, Loader2 } from "lucide-react";
import { NotificationPayload, NotificationType, InternalNotificationType } from "@/lib/realtime";

/** Styles par type de notification */
const typeStyles: Record<NotificationType, { icon: React.ReactNode; bg: string; border: string; text: string }> = {
  LETTER_VALIDATED: { icon: <CheckCircle className="w-5 h-5" />, bg: "bg-emerald-50", border: "border-emerald-200", text: "text-emerald-900" },
  LETTER_REJECTED: { icon: <AlertCircle className="w-5 h-5" />, bg: "bg-red-50", border: "border-red-200", text: "text-red-900" },
  PAYMENT_VALIDATED: { icon: <CheckCircle className="w-5 h-5" />, bg: "bg-emerald-50", border: "border-emerald-200", text: "text-emerald-900" },
  PAYMENT_REFUSED: { icon: <AlertCircle className="w-5 h-5" />, bg: "bg-red-50", border: "border-red-200", text: "text-red-900" },
  DECISION_RECEIVED: { icon: <Info className="w-5 h-5" />, bg: "bg-sky-50", border: "border-sky-200", text: "text-sky-900" },
  PROOF_REQUESTED: { icon: <AlertCircle className="w-5 h-5" />, bg: "bg-amber-50", border: "border-amber-200", text: "text-amber-900" },
  MESSAGE_RECEIVED: { icon: <Bell className="w-5 h-5" />, bg: "bg-indigo-50", border: "border-indigo-200", text: "text-indigo-900" },
  AVOCAT_ASSIGNED: { icon: <Info className="w-5 h-5" />, bg: "bg-indigo-50", border: "border-indigo-200", text: "text-indigo-900" },
  SIGNATURE_READY: { icon: <CheckCircle className="w-5 h-5" />, bg: "bg-emerald-50", border: "border-emerald-200", text: "text-emerald-900" },
  DEPOT_ASSISTE_READY: { icon: <Info className="w-5 h-5" />, bg: "bg-sky-50", border: "border-sky-200", text: "text-sky-900" },
};

/** Types internes à ne pas afficher */
const INTERNAL_TYPES: InternalNotificationType[] = ["CONNECTED", "HEARTBEAT"];

interface NotificationToastProps {
  /** Notification à afficher */
  notification: NotificationPayload;
  /** Callback quand l'utilisateur ferme */
  onClose: () => void;
  /** Callback quand l'utilisateur clique sur l'action */
  onAction?: () => void;
}

/** Composant interne - rendu uniquement côté client */
export default function NotificationToastInner({ notification, onClose, onAction }: NotificationToastProps) {
  const [visible, setVisible] = useState(false);
  const styles = typeStyles[notification.type as NotificationType] || typeStyles.LETTER_VALIDATED;
  const isInternal = INTERNAL_TYPES.includes(notification.type as InternalNotificationType);

  // Auto-close après 8s (sauf erreurs critiques)
  useEffect(() => {
    if (isInternal) return;
    const isCritical = ["LETTER_REJECTED", "PAYMENT_REFUSED"].includes(notification.type);
    const timeout = isCritical ? 0 : 8_000;

    if (timeout > 0) {
      const timer = setTimeout(() => {
        setVisible(false);
        setTimeout(onClose, 300); // Attendre l'animation
      }, timeout);
      return () => clearTimeout(timer);
    }
  }, [notification, onClose, isInternal]);

// Animation d'entrée
  useEffect(() => {
    if (!isInternal) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setVisible(true);
    }
  }, [isInternal]);

  if (isInternal) return null;

  return (
    <div
      className={`fixed bottom-4 right-4 z-50 flex items-start gap-3 max-w-md transform transition-all duration-300 ${
        visible ? "translate-x-0 opacity-100" : "translate-x-full opacity-0"
      }`}
      role="alert"
      aria-live="polite"
    >
      <div
        className={`flex items-start gap-3 p-4 rounded-xl border shadow-lg ${styles.bg} ${styles.border} ${styles.text}`}
      >
        <div className="flex-shrink-0 mt-0.5">{styles.icon}</div>

        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm">{notification.title}</p>
          <p className="mt-1 text-sm opacity-90">{notification.message}</p>

          {notification.actionUrl && (
            <button
              onClick={() => {
                onAction?.();
                onClose();
              }}
              className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium underline hover:no-underline"
            >
              Voir le dossier →
            </button>
          )}
        </div>

        <button
          onClick={onClose}
          className="flex-shrink-0 p-1 rounded-lg hover:bg-black/10 transition-colors"
          aria-label="Fermer"
        >
          <X className="w-4 h-4 opacity-60 hover:opacity-100" />
        </button>
      </div>
    </div>
  );
}