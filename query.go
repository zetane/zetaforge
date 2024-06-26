package main

import (
	"context"
	"crypto/sha1"
	"database/sql"
	"fmt"
	"log"

	"server/zdatabase"
	"server/zjson"

	wfv1 "github.com/argoproj/argo-workflows/v3/pkg/apis/workflow/v1alpha1"
)

type ResponsePipeline struct {
	Organization string
	Created      int64
	Uuid         string
	Hash         string
	Json         string
	Deployed     int64
}

type ResponsePipelineExecution struct {
	Organization  string
	Created       int64
	ExecutionTime int64
	Uuid          string
	Hash          string
	PipelineJson  string
	Deployed      int64
	Status        interface{}
	Completed     int64
	Workflow      string
	Execution     string
	Log           []string
	LogPath       string
	Results       string
}

type ResponseExecution struct {
	Hash      string
	Status    string
	Created   int64
	Completed int64
	Json      string
	Workflow  string
	Execution string
}

func newResponsePipeline(pipeline zdatabase.Pipeline) (ResponsePipeline, HTTPError) {
	var data zjson.Pipeline
	if err := json.Unmarshal([]byte(pipeline.Json), &data); err != nil {
		return ResponsePipeline{}, InternalServerError{err.Error()}
	}
	jsonData, err := json.Marshal(initialize(&data))
	if err != nil {
		return ResponsePipeline{}, InternalServerError{err.Error()}
	}

	return ResponsePipeline{
		Organization: pipeline.Organization,
		Created:      pipeline.Created,
		Uuid:         pipeline.Uuid,
		Hash:         pipeline.Hash,
		Json:         string(jsonData),
		Deployed:     pipeline.Deployed,
	}, nil
}

// Note the duplication here is because sqlc does not support
// generating the same struct from a join, so there are two identical
// structs with slightly different names
// see: https://github.com/sqlc-dev/sqlc/issues/781
func newResponsePipelineExecution(filterPipeline zdatabase.FilterPipelineRow, execLog []string) (ResponsePipelineExecution, HTTPError) {
	var data zjson.Pipeline
	if err := json.Unmarshal([]byte(filterPipeline.Json), &data); err != nil {
		return ResponsePipelineExecution{}, InternalServerError{err.Error()}
	}
	jsonData, err := json.Marshal(initialize(&data))
	if err != nil {
		return ResponsePipelineExecution{}, InternalServerError{err.Error()}
	}

	return ResponsePipelineExecution{
		Organization:  filterPipeline.Organization,
		Created:       filterPipeline.Created,
		ExecutionTime: filterPipeline.Created_2,
		Uuid:          filterPipeline.Uuid,
		Hash:          filterPipeline.Hash,
		PipelineJson:  string(jsonData),
		Deployed:      filterPipeline.Deployed,
		Status:        filterPipeline.Status,
		Completed:     filterPipeline.Completed.Int64,
		Workflow:      filterPipeline.Workflow.String,
		Execution:     filterPipeline.Executionid,
		Log:           execLog,
		Results:       filterPipeline.Results.String,
	}, nil
}

// Note the duplication here is because sqlc does not support
// generating the same struct from a join, so there are two identical
// structs with slightly different names
// see: https://github.com/sqlc-dev/sqlc/issues/781
func newResponsePipelinesExecution(filterPipeline zdatabase.FilterPipelinesRow, execLog []string, s3key string) (ResponsePipelineExecution, HTTPError) {
	var data zjson.Pipeline
	if err := json.Unmarshal([]byte(filterPipeline.Json), &data); err != nil {
		return ResponsePipelineExecution{}, InternalServerError{err.Error()}
	}
	jsonData, err := json.Marshal(initialize(&data))
	if err != nil {
		return ResponsePipelineExecution{}, InternalServerError{err.Error()}
	}

	return ResponsePipelineExecution{
		Organization:  filterPipeline.Organization,
		Created:       filterPipeline.Created,
		ExecutionTime: filterPipeline.Created_2,
		Uuid:          filterPipeline.Uuid,
		Hash:          filterPipeline.Hash,
		PipelineJson:  string(jsonData),
		Deployed:      filterPipeline.Deployed,
		Status:        filterPipeline.Status,
		Completed:     filterPipeline.Completed.Int64,
		Workflow:      filterPipeline.Workflow.String,
		Execution:     filterPipeline.Executionid,
		Log:           execLog,
		LogPath:       s3key,
		Results:       filterPipeline.Results.String,
	}, nil
}

func newResponseExecution(execution zdatabase.Execution, hash string) ResponseExecution {
	response := ResponseExecution{
		Hash:    hash,
		Status:  execution.Status.(string),
		Created: execution.Created,
	}

	if execution.Completed.Valid {
		response.Completed = execution.Completed.Int64
	}

	if execution.Json.Valid {
		response.Json = execution.Json.String
	}

	return response
}

func newResponseExecutionRow(execution zdatabase.ListExecutionsRow) ResponseExecution {
	response := ResponseExecution{
		Hash:    execution.Hash,
		Status:  execution.Status.(string),
		Created: execution.Created,
	}

	if execution.Completed.Valid {
		response.Completed = execution.Completed.Int64
	}

	if execution.Json.Valid {
		response.Json = execution.Json.String
	}

	return response
}

func newResponseExecutionsRow(execution zdatabase.Execution) ResponseExecution {
	response := ResponseExecution{
		Status:    execution.Status.(string),
		Created:   execution.Created,
		Workflow:  execution.Workflow.String,
		Execution: execution.Executionid,
	}
	if execution.Completed.Valid {
		response.Completed = execution.Completed.Int64
	}

	if execution.Json.Valid {
		response.Json = execution.Json.String
	}
	return response
}

func createPipeline(ctx context.Context, db *sql.DB, organization string, pipeline zjson.Pipeline) (zdatabase.Pipeline, HTTPError) {
	jsonData, err := json.Marshal(initialize(&pipeline))
	if err != nil {
		return zdatabase.Pipeline{}, InternalServerError{err.Error()}
	}
	hash := fmt.Sprintf("%x", sha1.Sum([]byte(jsonData)))

	tx, err := db.Begin()
	if err != nil {
		log.Printf("failed to initialize transaction; err=%v", err)
		return zdatabase.Pipeline{}, InternalServerError{err.Error()}
	}
	defer tx.Rollback()

	qtx := zdatabase.New(db).WithTx(tx)
	res, err := qtx.GetPipeline(ctx, zdatabase.GetPipelineParams{
		Organization: organization,
		Uuid:         pipeline.Id,
		Hash:         hash,
	})
	if err == sql.ErrNoRows {
		res, err = qtx.CreatePipeline(ctx, zdatabase.CreatePipelineParams{
			Organization: organization,
			Uuid:         pipeline.Id,
			Hash:         hash,
			Json:         jsonData,
		})
		if err != nil {
			return zdatabase.Pipeline{}, InternalServerError{err.Error()}
		}
	} else if err != nil {
		return zdatabase.Pipeline{}, InternalServerError{err.Error()}
	}

	if err := tx.Commit(); err != nil {
		log.Printf("failed to commit transaction; err=%v", err)
		return zdatabase.Pipeline{}, InternalServerError{err.Error()}
	}

	return res, nil
}

func softDeletePipeline(ctx context.Context, db *sql.DB, organization string, uuid string, hash string) HTTPError {
	q := zdatabase.New(db)
	if _, err := q.SoftDeletePipeline(ctx, zdatabase.SoftDeletePipelineParams{
		Organization: organization,
		Uuid:         uuid,
		Hash:         hash,
	}); err != nil {
		return InternalServerError{err.Error()}
	}

	return nil
}

func filterPipeline(ctx context.Context, db *sql.DB, executionid string) (zdatabase.FilterPipelineRow, HTTPError) {
	q := zdatabase.New(db)
	res, err := q.FilterPipeline(ctx, executionid)
	if err != nil {
		return zdatabase.FilterPipelineRow{}, InternalServerError{err.Error()}
	}
	return res, nil
}

func filterPipelines(ctx context.Context, db *sql.DB, limit int64, offset int64) ([]zdatabase.FilterPipelinesRow, HTTPError) {
	q := zdatabase.New(db)
	res, err := q.FilterPipelines(ctx, zdatabase.FilterPipelinesParams{
		Limit:  limit,
		Offset: offset,
	})
	if err != nil {
		return []zdatabase.FilterPipelinesRow{}, InternalServerError{err.Error()}
	}
	return res, nil
}

func allFilterPipelines(ctx context.Context, db *sql.DB) ([]zdatabase.AllFilterPipelinesRow, HTTPError) {
	q := zdatabase.New(db)
	res, err := q.AllFilterPipelines(ctx)
	if err != nil {
		return []zdatabase.AllFilterPipelinesRow{}, InternalServerError{err.Error()}
	}
	return res, nil
}

func listAllPipelines(ctx context.Context, db *sql.DB, organization string) ([]zdatabase.Pipeline, HTTPError) {
	q := zdatabase.New(db)
	res, err := q.ListAllPipelines(ctx, organization)
	if err != nil {
		return []zdatabase.Pipeline{}, InternalServerError{err.Error()}
	}
	return res, nil
}

func deployPipeline(ctx context.Context, db *sql.DB, organization string, uuid string, hash string) HTTPError {
	tx, err := db.Begin()
	if err != nil {
		log.Printf("failed to initialize transaction; err=%v", err)
		return InternalServerError{err.Error()}
	}
	defer tx.Rollback()

	qtx := zdatabase.New(db).WithTx(tx)
	if _, err := qtx.UndeployPipeline(ctx, zdatabase.UndeployPipelineParams{
		Organization: organization,
		Uuid:         uuid,
	}); err != nil && err != sql.ErrNoRows {
		return InternalServerError{err.Error()}
	}

	if _, err := qtx.DeployPipeline(ctx, zdatabase.DeployPipelineParams{
		Organization: organization,
		Uuid:         uuid,
		Hash:         hash,
	}); err != nil {
		return InternalServerError{err.Error()}
	}

	if err := tx.Commit(); err != nil {
		log.Printf("failed to commit transaction; err=%v", err)
		return InternalServerError{err.Error()}
	}

	return nil
}

func getPipeline(ctx context.Context, db *sql.DB, organization string, uuid string, hash string) (zdatabase.Pipeline, HTTPError) {
	q := zdatabase.New(db)
	res, err := q.GetPipeline(ctx, zdatabase.GetPipelineParams{
		Organization: organization,
		Uuid:         uuid,
		Hash:         hash,
	})
	if err == sql.ErrNoRows {
		return zdatabase.Pipeline{}, BadRequest{err.Error()}
	} else if err != nil {
		return zdatabase.Pipeline{}, InternalServerError{err.Error()}
	}

	return res, nil
}

func createExecution(ctx context.Context, db *sql.DB, pipeline int64, executionid string) (zdatabase.Execution, HTTPError) {
	q := zdatabase.New(db)
	res, err := q.CreateExecution(ctx, zdatabase.CreateExecutionParams{
		Pipeline:    pipeline,
		Executionid: executionid,
	})
	if err != nil {
		return zdatabase.Execution{}, InternalServerError{err.Error()}
	}
	return res, nil
}

func listRunningExecutions(ctx context.Context, db *sql.DB) ([]zdatabase.Execution, HTTPError) {
	q := zdatabase.New(db)
	res, err := q.ListRunningExecutions(ctx)
	if err != nil {
		return []zdatabase.Execution{}, InternalServerError{err.Error()}
	}
	return res, nil
}

func updateExecutionResults(ctx context.Context, db *sql.DB, execution int64, pipeline zjson.Pipeline) error {
	jsonPipeline, err := json.Marshal(pipeline)
	if err != nil {
		return err
	}
	q := zdatabase.New(db)
	_, err = q.UpdateExecutionResults(ctx, zdatabase.UpdateExecutionResultsParams{
		Json: jsonPipeline,
		ID:   execution,
	})
	return err
}

func updateExecutionJson(ctx context.Context, db *sql.DB, execution int64, workflow *wfv1.Workflow) error {
	jsonWorkflow, err := json.Marshal(workflow)
	if err != nil {
		return err
	}
	q := zdatabase.New(db)
	_, err = q.AddExecutionJson(ctx, zdatabase.AddExecutionJsonParams{
		Json: jsonWorkflow,
		ID:   execution,
	})
	return err
}

func addExecutionWorkflow(ctx context.Context, db *sql.DB, execution int64, workflow string) error {
	q := zdatabase.New(db)
	_, err := q.AddExecutionWorkflow(ctx, zdatabase.AddExecutionWorkflowParams{
		ID: execution,
		Workflow: sql.NullString{
			String: workflow,
			Valid:  true,
		},
	})
	return err
}

func completeExecution(ctx context.Context, db *sql.DB, execution int64) error {
	q := zdatabase.New(db)
	_, err := q.CompleteExecution(ctx, execution)
	return err
}

func updateExecutionStatus(ctx context.Context, db *sql.DB, execution int64, status string) error {
	q := zdatabase.New(db)
	_, err := q.UpdateExecutionStatus(ctx, zdatabase.UpdateExecutionStatusParams{
		ID:     execution,
		Status: status,
	})
	return err
}

func softDeleteExecution(ctx context.Context, db *sql.DB, organization string, uuid string, hash string, index int) HTTPError {
	if index < 0 {
		return BadRequest{"Negative index"}
	}

	tx, err := db.Begin()
	if err != nil {
		log.Printf("failed to initialize transaction; err=%v", err)
		return InternalServerError{err.Error()}
	}
	defer tx.Rollback()

	qtx := zdatabase.New(db).WithTx(tx)
	res, err := qtx.ListPipelineExecutions(ctx, zdatabase.ListPipelineExecutionsParams{
		Organization: organization,
		Uuid:         uuid,
		Hash:         hash,
	})

	if err != nil {
		return InternalServerError{err.Error()}
	}

	if index >= len(res) {
		return BadRequest{"Index is larger than the number of executions"}
	}

	if _, err = qtx.SoftDeleteExecution(ctx, res[index].ID); err != nil {
		return InternalServerError{err.Error()}
	}

	if err := tx.Commit(); err != nil {
		log.Printf("failed to commit transaction; err=%v", err)
		return InternalServerError{err.Error()}
	}

	return nil
}

func listAllExecutions(ctx context.Context, db *sql.DB, organization string, uuid string) ([]zdatabase.ListExecutionsRow, HTTPError) {
	q := zdatabase.New(db)
	res, err := q.ListExecutions(ctx, zdatabase.ListExecutionsParams{
		Organization: organization,
		Uuid:         uuid,
	})
	if err != nil {
		return []zdatabase.ListExecutionsRow{}, InternalServerError{err.Error()}
	}

	return res, nil
}

func listExecutions(ctx context.Context, db *sql.DB, organization string, uuid string, hash string) ([]zdatabase.Execution, HTTPError) {
	q := zdatabase.New(db)
	res, err := q.ListPipelineExecutions(ctx, zdatabase.ListPipelineExecutionsParams{
		Organization: organization,
		Uuid:         uuid,
		Hash:         hash,
	})
	if err != nil {
		return []zdatabase.Execution{}, InternalServerError{err.Error()}
	}

	return res, nil
}

func getExecutionById(ctx context.Context, db *sql.DB, executionId string) (zdatabase.Execution, HTTPError) {
	q := zdatabase.New(db)
	res, err := q.GetExecutionByExecutionId(ctx, executionId)
	if err != nil {
		return zdatabase.Execution{}, InternalServerError{err.Error()}
	}

	return res, nil
}

func getExecution(ctx context.Context, db *sql.DB, organization string, uuid string, hash string, index int) (zdatabase.Execution, HTTPError) {
	if index < 0 {
		return zdatabase.Execution{}, BadRequest{"Negative index"}
	}

	tx, err := db.Begin()
	if err != nil {
		log.Printf("failed to initialize transaction; err=%v", err)
		return zdatabase.Execution{}, InternalServerError{err.Error()}
	}
	defer tx.Rollback()

	qtx := zdatabase.New(db).WithTx(tx)
	res, err := qtx.ListPipelineExecutions(ctx, zdatabase.ListPipelineExecutionsParams{
		Organization: organization,
		Uuid:         uuid,
		Hash:         hash,
	})

	if err != nil {
		return zdatabase.Execution{}, InternalServerError{err.Error()}
	}

	if index >= len(res) {
		return zdatabase.Execution{}, BadRequest{"Index is larger than the number of executions"}
	}

	execution, err := qtx.GetExecution(ctx, res[index].ID)
	if err != nil {
		return zdatabase.Execution{}, InternalServerError{err.Error()}
	}

	if err := tx.Commit(); err != nil {
		log.Printf("failed to commit transaction; err=%v", err)
		return zdatabase.Execution{}, InternalServerError{err.Error()}
	}

	return execution, nil
}

func setSetupVersion(ctx context.Context, db *sql.DB, version string) (zdatabase.SetupVersion, error) {
	tx, err := db.Begin()
	if err != nil {
		log.Printf("failed to initialize transaction; err=%v", err)
		return zdatabase.SetupVersion{}, InternalServerError{err.Error()}
	}
	defer tx.Rollback()

	qtx := zdatabase.New(db).WithTx(tx)
	res, err := qtx.GetSetupVersion(ctx)
	if err != nil {
		res, err = qtx.CreateSetupVersion(ctx, version)
	} else {
		res, err = qtx.UpdateSetupVersion(ctx, zdatabase.UpdateSetupVersionParams{
			ID:      res.ID,
			Version: version,
		})
	}

	if err := tx.Commit(); err != nil {
		log.Printf("failed to commit transaction; err=%v", err)
		return zdatabase.SetupVersion{}, InternalServerError{err.Error()}
	}

	return res, err
}

func getSetupVersion(ctx context.Context, db *sql.DB) (zdatabase.SetupVersion, error) {
	q := zdatabase.New(db)
	res, err := q.GetSetupVersion(ctx)
	if err != nil {
		return zdatabase.SetupVersion{}, err
	}

	return res, nil
}
