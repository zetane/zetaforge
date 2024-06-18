import { Button } from "@carbon/react";
import { useAtom } from "jotai";
import { modalContentAtom } from "@/atoms/modalAtom";
import { ExecutionDataGrid } from "@/components/ui/ExecutionDataGrid";
import { useImmerAtom } from "jotai-immer";
import { workspaceAtom, getPipelines } from "@/atoms/pipelineAtom";
import { useEffect, useState } from "react";

export default function PipelinesButton() {
  const [modalContent, setModalContent] = useAtom(modalContentAtom);
  const [workspace, setWorkspace] = useImmerAtom(workspaceAtom);
  const [executions, setExecutions] = useState([]);
  const modalPopper = (content) => {
    setModalContent({
      ...modalContent,
      show: true,
      content: content,
    });
  };

  const closeModal = () => {
    setModalContent({
      show: false
    })
  }

  const styles = {
    margin: '5px',
  };

  useEffect(() => {
    const runs = getPipelines(workspace)
    setExecutions(runs)
  }, [workspace?.pipelines])

  let count = 0;
  if (executions) {
    count = executions.length
  }

  let grid = (<ExecutionDataGrid executions={executions} closeModal={closeModal} />);

  const svgOverride = { position: 'absolute', right: '15px', top: '5px'}
  return (
    <Button style={styles} size="sm" kind="secondary"
      onClick={ () => modalPopper(grid) }>
      Pipelines ({count})
    </Button>
  )
}
