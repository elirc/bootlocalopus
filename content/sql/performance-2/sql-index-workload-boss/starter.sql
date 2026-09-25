-- The index migration for tickets. The workload (see the brief) is every
-- query the application runs against this table.
--
-- Current indexes:
--   tickets_tenant_idx         (tenant_id)
--   tickets_status_idx         (status)
--   tickets_tenant_status_idx  (tenant_id, status)
--   tickets_subject_idx        (subject)

analyze tickets;
