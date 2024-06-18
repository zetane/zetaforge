-- +goose Up
-- +goose StatementBegin
SELECT 'up SQL query';
ALTER TABLE Executions ADD results TEXT;
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
SELECT 'down SQL query';
ALTER TABLE Executions DROP results;
-- +goose StatementEnd
