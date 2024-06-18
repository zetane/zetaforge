import { drawflowEditorAtom } from "@/atoms/drawflowAtom";
import { pipelineAtom } from "@/atoms/pipelineAtom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { mixpanelAtom } from "@/atoms/mixpanelAtom";
import generateSchema from '@/utils/schemaValidation';
import { trpc } from "@/utils/trpc";
import { Button } from "@carbon/react";
import axios from "axios";
import { useAtom } from "jotai";
import { useImmerAtom } from "jotai-immer";
import { useRef, useState } from "react";
import { uuidv7 } from "uuidv7";
import ClosableModal from "./modal/ClosableModal";
import { workspaceAtom } from "@/atoms/pipelineAtom";
import { activeConfigurationAtom } from "@/atoms/anvilConfigurationsAtom";
import { useLoadServerPipeline } from "./useLoadPipeline";

const usePostExecution = (queryClient, configuration, setWorkspace, loadServerPipeline) => {
  const mutation = useMutation({
    mutationFn: async (execution) => {
      const response = await fetch(`http://${configuration.host}:${configuration.anvilPort}/execute`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(execution),
      });

      if (!response.ok) {
        throw new Error('Request failed');
      }

      const data = await response.json();
      return data;
    },
    onSuccess: (newExecution) => {
      queryClient.setQueryData(['pipelines'], (oldExecutions) => {
        let updatedPipelines = [];

        if (oldExecutions && Array.isArray(oldExecutions)) {
          // Check if the new execution already exists in the array
          const existingIndex = oldExecutions.findIndex(
            (execution) => execution.Execution === newExecution.Execution
          );

          if (existingIndex !== -1) {
            // If the execution exists, replace it with the new execution
            updatedPipelines = [
              ...oldExecutions.slice(0, existingIndex),
              newExecution,
              ...oldExecutions.slice(existingIndex + 1),
            ];
          } else {
            // If the execution doesn't exist, add it to the beginning of the array
            updatedPipelines = [newExecution, ...oldExecutions];
          }
        } else {
          // If oldExecutions is not an array, return a new array with the new execution
          updatedPipelines = [newExecution];
        }
        return updatedPipelines
      });

      setWorkspace((draft) => {
        const currentTab = draft.active
        const newKey = newExecution.Uuid + "." + newExecution.Execution
        const pipeline = draft.pipelines[newKey]
        if (!pipeline) {
          // key hasn't updated yet
          const loaded = loadServerPipeline(newExecution, configuration)
          draft.pipelines[newKey] = loaded
          draft.executions[loaded.record.Execution] = loaded
        }
        draft.tabs[newKey] = {}
        draft.active = newKey
        delete draft.tabs[currentTab]
      })
    },
  });

  return mutation;
};

const buildSortKeys = (specs) => {
  for (const blockId in specs.pipeline) {
    const orderObject = {
      input: [],
      output: [],
    };

    const block = specs.pipeline[blockId];
    const inputKeys = Object.keys(block.inputs);
    const outputKeys = Object.keys(block.outputs);

    orderObject.input = (inputKeys);
    orderObject.output = (outputKeys);

    block.views.node.order = orderObject
  }

  return specs
}

export default function RunPipelineButton({ modalPopper, children, action }) {
  const [editor] = useAtom(drawflowEditorAtom);
  const [pipeline, setPipeline] = useImmerAtom(pipelineAtom);
  const [workspace, setWorkspace] = useImmerAtom(workspaceAtom)
  const [validationErrorMsg, setValidationErrorMsg] = useState([]);
  const [isOpen, setIsOpen] = useState(false);
  const [mixpanelService] = useAtom(mixpanelAtom)
  const [configuration] = useAtom(activeConfigurationAtom);
  const queryClient = useQueryClient();
  const loadServerPipeline = useLoadServerPipeline();

  const postExecution = usePostExecution(queryClient, configuration, setWorkspace, loadServerPipeline);
  const uploadParameterBlocks = trpc.uploadParameterBlocks.useMutation();

  const runPipeline = async (editor, pipeline) => {
    // check if pipeline structure exists
    if (!pipeline.data || !Object.keys(pipeline.data).length) return null;
    setValidationErrorMsg([])

    let pipelineSpecs = editor.convert_drawflow_to_block(pipeline.name, pipeline.data);
    const executionId = uuidv7();

    try {
      const res = await axios.get(`${import.meta.env.VITE_EXECUTOR}/ping`)
      if (res.status != 200) {
        throw Error()
      }
    } catch(error) {
      setValidationErrorMsg(["Seaweed ping did not return ok. Please wait a few seconds and retry."])
      setIsOpen(true)
      return null;
    }

    try {
      pipelineSpecs = await uploadParameterBlocks.mutateAsync({
        pipelineId: pipeline.id,
        executionId: executionId,
        pipelineSpecs: pipelineSpecs,
        buffer: pipeline.buffer,
        anvilConfiguration: configuration,
      });
    } catch (error) {
      setValidationErrorMsg([`Failed to upload files to anvil server: ${error}`])
      setIsOpen(true)
      return null;
    }

    const schema = generateSchema(pipeline.data);
    const results = schema.safeParse(pipeline.data);

    if (!results.success) {
      setValidationErrorMsg(prev => {
        return results.error.issues.map(block => `${block.path[0]}: ${block.message}`)
      })
      setIsOpen(true)
      return null;
    } else {
      setValidationErrorMsg([]);
    }

    try {
      const sortedPipeline = buildSortKeys(pipelineSpecs)
      // tries to put history in a user path if it exists, if not
      // will put it into the buffer path (.cache)
      pipelineSpecs['sink'] = pipeline.path ? pipeline.path : pipeline.buffer
      // Pull containers from the buffer to ensure the most recent ones
      // In the case where a user has a savePath but a mod has happened since
      // Last save
      // TODO: Set a flag (right now it's a timestamp)
      // and break the cache when user mods the canvas
      pipelineSpecs['build'] = pipeline.buffer
      pipelineSpecs['name'] = pipeline.name
      pipelineSpecs['id'] = pipeline.id
      const rebuild = (action == "Rebuild")
      const execution = {
        id: executionId,
        pipeline: sortedPipeline,
        build: rebuild
      }

      const response = await postExecution.mutateAsync(execution)
    } catch (error) {
      setValidationErrorMsg([error.message])
      setIsOpen(true)
    }
  };

  const styles = {
    margin: '5px',
  };


  return (
    <>
      <Button style={styles} size="sm" onClick={() => { runPipeline(editor, pipeline) }}>
        <span>{action}</span>
        {children}
      </Button>

      <ClosableModal
        modalHeading="The following error(s) occurred:"
        passiveModal={true}
        open={isOpen}
        onRequestClose={() => setIsOpen(false)}
      >
        <div className="flex flex-col gap-4 p-3">
          {validationErrorMsg.map((error, i) => {
            return (
              <p key={"error-msg-" + i}>{error}</p>
            )
          })}
        </div>
      </ClosableModal>
    </>
  );
}
