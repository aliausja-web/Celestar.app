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
    case 'manual_escalation':
      return {
        title: t('notifContent.escalationTitle'),
        message: t('notifContent.escalationMsg', { unit: unitTitle }),
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
