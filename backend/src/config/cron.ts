// src/config/cron.config.ts
export const CRON_SCHEDULES = {
  CLEANUP_ORPHANED_PINS: process.env.CLEANUP_CRON_SCHEDULE || '0 * * * *',

};