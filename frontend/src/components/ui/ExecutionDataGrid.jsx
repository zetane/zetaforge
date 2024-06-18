import ClosableModal from "./modal/ClosableModal";
import { workspaceAtom } from "@/atoms/pipelineAtom";
import { useImmerAtom } from "jotai-immer";
import { useAtom } from "jotai";
import { DataTable, Table, TableHead, TableRow, TableHeader, TableBody, TableCell, Link } from "@carbon/react";
import { PipelineStopButton } from "./PipelineStopButton";
import { useState, useEffect } from "react";
import { activeConfigurationAtom } from "@/atoms/anvilConfigurationsAtom";

export const ExecutionDataGrid = ({executions, closeModal}) => {
  const [workspace, setWorkspace] = useImmerAtom(workspaceAtom);
  const [pipelineList, setPipelineList] = useState([])
  const [configuration] = useAtom(activeConfigurationAtom);

  const selectPipeline = (pipeline) => {
    const key = pipeline.id + "." + pipeline.record.Execution

    setWorkspace((draft) => {
      draft.tabs[key] = {}
      draft.active = key
    })

    closeModal();
  }

  useEffect(() => {
    const items = []
    for (const pipeline of executions) {
      const record = pipeline.record;
      const pipelineData = JSON.parse(record.PipelineJson)
      const friendlyName = pipelineData.name
      const executionId = record?.Execution;
      let stopAction = null;
      if (record.Status == "Running" || record.Status == "Pending") {
        stopAction = <PipelineStopButton executionId={executionId} configuration={configuration}/>;
      }

      items.push({
        id: executionId,
        pipeline: friendlyName,
        name: <Link href="#" onClick={() => {selectPipeline(pipeline)}}>{executionId}</Link>,
        created: new Date(record?.ExecutionTime * 1000).toLocaleString(),
        status: record?.Status,
        deployed: record?.Deployed,
        actions: stopAction,
      });
    }
    setPipelineList(items)
  }, [executions])



  const headers = [
    {
      key: 'name',
      header: 'ExecutionId',
    },
    {
      key: 'pipeline',
      header: 'Pipeline'
    },
    {
      key: 'created',
      header: 'Created'
    },
    {
      key: 'status',
      header: 'Status'
    },
    {
      key: 'deployed',
      header: 'Deployed'
    },
    {
      key: 'actions',
      header: 'Actions'
    }
  ];
  return (
    <ClosableModal
      modalHeading="Running Pipelines"
      passiveModal={true}
      modalClass="custom-modal-size"
    >
      <DataTable rows={pipelineList} headers={headers}>
        {({ rows, headers, getTableProps, getHeaderProps, getRowProps }) => (
          <Table {...getTableProps()}>
            <TableHead>
              <TableRow>
                {headers.map((header) => (
                  <TableHeader {...getHeaderProps({ header })}>
                    {header.header}
                  </TableHeader>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((row) => (
                <TableRow {...getRowProps({ row })}>
                  {row.cells.map((cell) => {
                    return (
                      <TableCell key={cell.id}>{cell.value}</TableCell>
                    )
                  })}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </DataTable>
    </ClosableModal>
  );
};
