// src/config/cron.config.ts
export const CRON_SCHEDULES = {
  CLEANUP_ORPHANED_PINS: process.env.CLEANUP_CRON_SCHEDULE || '0 * * * *',
  CLEANUP_EXPIRED_TRASH: process.env.TRASH_CLEANUP_CRON_SCHEDULE || '17 3 * * *'
};