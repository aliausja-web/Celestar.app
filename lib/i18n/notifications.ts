/**
 * Translates stored notification content using type + metadata.
 * Falls back to the raw stored title/message for unknown types or missing params.
 */

interface RawNotification {
  title: string;
  message: string;
  type: string;
  metadata?: Record<string, string | null> | null;
}

function extractQuotedTitle(message: string): string {
  const match = message.match(/"([^"]+)"/);
  return match ? match[1] : '';
}

export function getNotifContent(
  notification: RawNotification,
  t: (key: string, params?: Record<string, string | number>) => string
): { title: string; message: string } {
  const meta = (notification.metadata || {}) as Record<string, string | null>;
  const unitTitle = meta.unit_title || extractQuotedTitle(notification.message) || '';

  switch (notification.type) {
    case 'proof_submitted':
      return {
        title: t('notifContent.proofSubmittedTitle'),
        message: t('notifContent.proofSubmittedMsg', {
          submitter: meta.submitted_by || '',
          unit: unitTitle,
        }),
      };

    case 'proof_approved':
      return {
        title: t('notifContent.proofApprovedTitle'),
        message: t('notifContent.proofApprovedMsg', {
          unit: unitTitle,
          reviewer: meta.reviewed_by || '',
        }),
      };

    case 'proof_rejected':
      return {
        title: t('notifContent.proofRejectedTitle'),
        message: t('notifContent.proofRejectedMsg', {
          unit: unitTitle,
          reason: meta.rejection_reason || '',
        }),
      };

    case 'escalation':
      return {
        title: t('notifContent.escalationTitle'),
        message: t('notifContent.escalationMsg', { unit: unitTitle, reason: '' }),
      };
    case 'manual_escalation':
      return {
        title: t('notifContent.escalationTitle'),
        message: t('notifContent.escalationMsg', { unit: unitTitle, reason: meta.reason || '' }),
      };

    case 'deadline_approaching': {
      const isUrgent = notification.title.toLowerCase().includes('urgent');
      const isOverdue = notification.title.toLowerCase().includes('overdue');
      if (isOverdue) {
        return {
          title: t('notifContent.deadlineOverdueTitle'),
          message: t('notifContent.deadlineOverdueMsg', { unit: unitTitle }),
        };
      }
      if (isUrgent) {
        return {
          title: t('notifContent.deadlineUrgentTitle'),
          message: t('notifContent.deadlineUrgentMsg', { unit: unitTitle }),
        };
      }
      return {
        title: t('notifContent.deadlineTitle'),
        message: t('notifContent.deadlineMsg', { unit: unitTitle }),
      };
    }

    case 'unit_confirmed':
      return {
        title: t('notifContent.unitConfirmedTitle'),
        message: t('notifContent.unitConfirmedMsg', { unit: unitTitle }),
      };

    case 'unit_unblocked':
      return {
        title: t('notifContent.unitUnblockedTitle'),
        message: t('notifContent.unitUnblockedMsg', {
          unit: unitTitle,
          resolver: meta.resolved_by || '',
          note: meta.resolution_note || '',
        }),
      };

    case 'automatic_escalation':
      return {
        title: t('notifContent.autoEscalationTitle', {
          level: meta.escalation_level || '?',
        }),
        message: t('notifContent.autoEscalationMsg', {
          unit: unitTitle,
          level: meta.escalation_level || '?',
        }),
      };

    case 'deadline_alert':
      return {
        title: t('notifContent.deadlineAlertTitle', {
          level: meta.alert_level || '?',
        }),
        message: t('notifContent.deadlineAlertMsg', {
          unit: unitTitle,
          level: meta.alert_level || '?',
          pct: meta.percentage_elapsed || '?',
        }),
      };

    default:
      return { title: notification.title, message: notification.message };
  }
}

export function formatRelativeTimeI18n(
  isoString: string,
  t: (key: string, params?: Record<string, string | number>) => string
): string {
  const date = new Date(isoString);
  if (isNaN(date.getTime())) return t('admin.justNow');
  const diffMs = Date.now() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return t('admin.justNow');
  if (diffMins < 60) return t('admin.minsAgo', { n: diffMins });
  if (diffHours < 24) return t('admin.hoursAgo', { n: diffHours });
  return t('admin.daysAgo', { n: diffDays });
}
