CREATE INDEX "idx_audit_event_when" ON "audit_event" USING btree ("when");

-- Trigger immutabilité NFR-O1 MVP-1
-- Rétention audit 7 ans — ne pas purger avant 2033+
CREATE OR REPLACE FUNCTION prevent_audit_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit_event is immutable: operation % on row % is forbidden', TG_OP, OLD.id;
END;
$$;

CREATE TRIGGER prevent_audit_update_delete
  BEFORE UPDATE OR DELETE ON "audit_event"
  FOR EACH ROW EXECUTE FUNCTION prevent_audit_mutation();