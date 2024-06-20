-- +goose Up
-- +goose StatementBegin
SELECT 'up SQL query';
ALTER TABLE Executions ADD workflow TEXT;
CREATE INDEX executions_workflow_idx ON Executions (workflow);
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
SELECT 'down SQL query';
DROP INDEX IF EXISTS executions_workflow_idx;
ALTER TABLE Executions DROP workflow;
-- +goose StatementEnd
