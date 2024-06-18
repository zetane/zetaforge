// Code generated by sqlc. DO NOT EDIT.
// versions:
//   sqlc v1.25.0
// source: executions.sql

package zdatabase

import (
	"context"
	"database/sql"
)

const addExecutionJson = `-- name: AddExecutionJson :one
UPDATE Executions
SET json = json(?)
WHERE id = ?
RETURNING id, pipeline, status, created, completed, json, deleted, executionid, workflow, results
`

type AddExecutionJsonParams struct {
	Json interface{}
	ID   int64
}

func (q *Queries) AddExecutionJson(ctx context.Context, arg AddExecutionJsonParams) (Execution, error) {
	row := q.db.QueryRowContext(ctx, addExecutionJson, arg.Json, arg.ID)
	var i Execution
	err := row.Scan(
		&i.ID,
		&i.Pipeline,
		&i.Status,
		&i.Created,
		&i.Completed,
		&i.Json,
		&i.Deleted,
		&i.Executionid,
		&i.Workflow,
		&i.Results,
	)
	return i, err
}

const addExecutionWorkflow = `-- name: AddExecutionWorkflow :one
UPDATE Executions
SET workflow = ?
WHERE id = ?
RETURNING id, pipeline, status, created, completed, json, deleted, executionid, workflow, results
`

type AddExecutionWorkflowParams struct {
	Workflow sql.NullString
	ID       int64
}

func (q *Queries) AddExecutionWorkflow(ctx context.Context, arg AddExecutionWorkflowParams) (Execution, error) {
	row := q.db.QueryRowContext(ctx, addExecutionWorkflow, arg.Workflow, arg.ID)
	var i Execution
	err := row.Scan(
		&i.ID,
		&i.Pipeline,
		&i.Status,
		&i.Created,
		&i.Completed,
		&i.Json,
		&i.Deleted,
		&i.Executionid,
		&i.Workflow,
		&i.Results,
	)
	return i, err
}

const completeExecution = `-- name: CompleteExecution :one
UPDATE Executions
SET completed = unixepoch('now')
WHERE id = ?
RETURNING id, pipeline, status, created, completed, json, deleted, executionid, workflow, results
`

func (q *Queries) CompleteExecution(ctx context.Context, id int64) (Execution, error) {
	row := q.db.QueryRowContext(ctx, completeExecution, id)
	var i Execution
	err := row.Scan(
		&i.ID,
		&i.Pipeline,
		&i.Status,
		&i.Created,
		&i.Completed,
		&i.Json,
		&i.Deleted,
		&i.Executionid,
		&i.Workflow,
		&i.Results,
	)
	return i, err
}

const createExecution = `-- name: CreateExecution :one
INSERT INTO Executions(
	pipeline, executionid, created
) VALUES (
	?, ?, unixepoch('now')
)
RETURNING id, pipeline, status, created, completed, json, deleted, executionid, workflow, results
`

type CreateExecutionParams struct {
	Pipeline    int64
	Executionid string
}

func (q *Queries) CreateExecution(ctx context.Context, arg CreateExecutionParams) (Execution, error) {
	row := q.db.QueryRowContext(ctx, createExecution, arg.Pipeline, arg.Executionid)
	var i Execution
	err := row.Scan(
		&i.ID,
		&i.Pipeline,
		&i.Status,
		&i.Created,
		&i.Completed,
		&i.Json,
		&i.Deleted,
		&i.Executionid,
		&i.Workflow,
		&i.Results,
	)
	return i, err
}

const getExecution = `-- name: GetExecution :one
SELECT id, pipeline, status, created, completed, json, deleted, executionid, workflow, results FROM Executions
WHERE id = ?
`

func (q *Queries) GetExecution(ctx context.Context, id int64) (Execution, error) {
	row := q.db.QueryRowContext(ctx, getExecution, id)
	var i Execution
	err := row.Scan(
		&i.ID,
		&i.Pipeline,
		&i.Status,
		&i.Created,
		&i.Completed,
		&i.Json,
		&i.Deleted,
		&i.Executionid,
		&i.Workflow,
		&i.Results,
	)
	return i, err
}

const getExecutionByExecutionId = `-- name: GetExecutionByExecutionId :one
SELECT id, pipeline, status, created, completed, json, deleted, executionid, workflow, results FROM Executions
WHERE executionid = ?
`

func (q *Queries) GetExecutionByExecutionId(ctx context.Context, executionid string) (Execution, error) {
	row := q.db.QueryRowContext(ctx, getExecutionByExecutionId, executionid)
	var i Execution
	err := row.Scan(
		&i.ID,
		&i.Pipeline,
		&i.Status,
		&i.Created,
		&i.Completed,
		&i.Json,
		&i.Deleted,
		&i.Executionid,
		&i.Workflow,
		&i.Results,
	)
	return i, err
}

const listExecutions = `-- name: ListExecutions :many
SELECT e.id, e.pipeline, e.status, e.created, e.completed, e.json, e.deleted, e.executionid, e.workflow, e.results, p.hash FROM Executions e
INNER JOIN Pipelines p ON p.id = e.pipeline
WHERE organization = ? AND uuid = ? AND e.deleted = FALSE AND p.deleted = FALSE
ORDER BY e.created DESC
`

type ListExecutionsParams struct {
	Organization string
	Uuid         string
}

type ListExecutionsRow struct {
	ID          int64
	Pipeline    int64
	Status      interface{}
	Created     int64
	Completed   sql.NullInt64
	Json        sql.NullString
	Deleted     int64
	Executionid string
	Workflow    sql.NullString
	Results     sql.NullString
	Hash        string
}

func (q *Queries) ListExecutions(ctx context.Context, arg ListExecutionsParams) ([]ListExecutionsRow, error) {
	rows, err := q.db.QueryContext(ctx, listExecutions, arg.Organization, arg.Uuid)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var items []ListExecutionsRow
	for rows.Next() {
		var i ListExecutionsRow
		if err := rows.Scan(
			&i.ID,
			&i.Pipeline,
			&i.Status,
			&i.Created,
			&i.Completed,
			&i.Json,
			&i.Deleted,
			&i.Executionid,
			&i.Workflow,
			&i.Results,
			&i.Hash,
		); err != nil {
			return nil, err
		}
		items = append(items, i)
	}
	if err := rows.Close(); err != nil {
		return nil, err
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return items, nil
}

const listPipelineExecutions = `-- name: ListPipelineExecutions :many
SELECT e.id, e.pipeline, e.status, e.created, e.completed, e.json, e.deleted, e.executionid, e.workflow, e.results FROM Executions e
INNER JOIN Pipelines p ON p.id = e.pipeline
WHERE organization = ? AND uuid = ? AND hash = ? AND e.deleted = FALSE
ORDER BY e.created DESC
`

type ListPipelineExecutionsParams struct {
	Organization string
	Uuid         string
	Hash         string
}

func (q *Queries) ListPipelineExecutions(ctx context.Context, arg ListPipelineExecutionsParams) ([]Execution, error) {
	rows, err := q.db.QueryContext(ctx, listPipelineExecutions, arg.Organization, arg.Uuid, arg.Hash)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var items []Execution
	for rows.Next() {
		var i Execution
		if err := rows.Scan(
			&i.ID,
			&i.Pipeline,
			&i.Status,
			&i.Created,
			&i.Completed,
			&i.Json,
			&i.Deleted,
			&i.Executionid,
			&i.Workflow,
			&i.Results,
		); err != nil {
			return nil, err
		}
		items = append(items, i)
	}
	if err := rows.Close(); err != nil {
		return nil, err
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return items, nil
}

const listRunningExecutions = `-- name: ListRunningExecutions :many
SELECT e.id, e.pipeline, e.status, e.created, e.completed, e.json, e.deleted, e.executionid, e.workflow, e.results FROM Executions e
WHERE e.deleted = FALSE AND e.status = 'Running' AND e.completed is null AND e.workflow is not null
ORDER BY e.created DESC
`

func (q *Queries) ListRunningExecutions(ctx context.Context) ([]Execution, error) {
	rows, err := q.db.QueryContext(ctx, listRunningExecutions)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var items []Execution
	for rows.Next() {
		var i Execution
		if err := rows.Scan(
			&i.ID,
			&i.Pipeline,
			&i.Status,
			&i.Created,
			&i.Completed,
			&i.Json,
			&i.Deleted,
			&i.Executionid,
			&i.Workflow,
			&i.Results,
		); err != nil {
			return nil, err
		}
		items = append(items, i)
	}
	if err := rows.Close(); err != nil {
		return nil, err
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return items, nil
}

const softDeleteExecution = `-- name: SoftDeleteExecution :one
UPDATE Executions
SET deleted = TRUE
WHERE id = ?
RETURNING id, pipeline, status, created, completed, json, deleted, executionid, workflow, results
`

func (q *Queries) SoftDeleteExecution(ctx context.Context, id int64) (Execution, error) {
	row := q.db.QueryRowContext(ctx, softDeleteExecution, id)
	var i Execution
	err := row.Scan(
		&i.ID,
		&i.Pipeline,
		&i.Status,
		&i.Created,
		&i.Completed,
		&i.Json,
		&i.Deleted,
		&i.Executionid,
		&i.Workflow,
		&i.Results,
	)
	return i, err
}

const updateExecutionResults = `-- name: UpdateExecutionResults :one
UPDATE Executions
SET results = json(?)
WHERE id = ?
RETURNING id, pipeline, status, created, completed, json, deleted, executionid, workflow, results
`

type UpdateExecutionResultsParams struct {
	Json interface{}
	ID   int64
}

func (q *Queries) UpdateExecutionResults(ctx context.Context, arg UpdateExecutionResultsParams) (Execution, error) {
	row := q.db.QueryRowContext(ctx, updateExecutionResults, arg.Json, arg.ID)
	var i Execution
	err := row.Scan(
		&i.ID,
		&i.Pipeline,
		&i.Status,
		&i.Created,
		&i.Completed,
		&i.Json,
		&i.Deleted,
		&i.Executionid,
		&i.Workflow,
		&i.Results,
	)
	return i, err
}

const updateExecutionStatus = `-- name: UpdateExecutionStatus :one
UPDATE Executions
SET status = ?
WHERE id = ?
RETURNING id, pipeline, status, created, completed, json, deleted, executionid, workflow, results
`

type UpdateExecutionStatusParams struct {
	Status interface{}
	ID     int64
}

func (q *Queries) UpdateExecutionStatus(ctx context.Context, arg UpdateExecutionStatusParams) (Execution, error) {
	row := q.db.QueryRowContext(ctx, updateExecutionStatus, arg.Status, arg.ID)
	var i Execution
	err := row.Scan(
		&i.ID,
		&i.Pipeline,
		&i.Status,
		&i.Created,
		&i.Completed,
		&i.Json,
		&i.Deleted,
		&i.Executionid,
		&i.Workflow,
		&i.Results,
	)
	return i, err
}
