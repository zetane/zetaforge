import { drawflowEditorAtom } from "@/atoms/drawflowAtom";
import { pipelineAtom } from "@/atoms/pipelineAtom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { mixpanelAtom } from "@/atoms/mixpanelAtom";
import generateSchema from '@/utils/schemaValidation';
import { trpc } from "@/utils/trpc";
import { Button } from "@carbon/react";
import { useAtom } from "jotai";
import { useImmerAtom } from "jotai-immer";
import { useState } from "react";
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
      })
      const data = await response.json()

      if (!response.ok) {
        throw new Error(`Request failed: ${data}`);
      }

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


export default function RunPipelineButton({ children, action }) {
  const [editor] = useAtom(drawflowEditorAtom);
  const [pipeline, setPipeline] = useImmerAtom(pipelineAtom);
  const [validationErrorMsg, setValidationErrorMsg] = useState([]);
  const [isOpen, setIsOpen] = useState(false);
  const [mixpanelService] = useAtom(mixpanelAtom)
  const [configuration] = useAtom(activeConfigurationAtom);
  const executePipeline = trpc.executePipeline.useMutation();

  const runPipeline = async () => {
    if (!validatePipelineExists()) return;

    setValidationErrorMsg([])

    const pipelineSpecs = editor.convert_drawflow_to_block(pipeline.name, pipeline.data);
    const executionId = uuidv7();

    if (!(await validateAnvilOnline())) return;
    if (!validateSchema()) return;
    if (!(await execute(pipelineSpecs, executionId))) return;

    setPipeline((draft) => {
      draft.socketUrl = `ws://${configuration.host}:${configuration.anvilPort}/ws/${draft.id}`;
      draft.history = `${draft.id}/${executionId}`;
      draft.saveTime = Date.now();
      draft.log = [];
    })

    trackMixpanelRunCreated();
  };
  

  const validatePipelineExists = async () => {
    return pipeline.data && Object.keys(pipeline.data).length
  }

  const validateAnvilOnline =  async () => {
    if (await pingAnvil()){
      return true
    } else {
      setValidationErrorMsg(["Seaweed ping did not return ok. Please wait a few seconds and retry."])
      setIsOpen(true)
      return false;
    }
  }

  const pingAnvil = async () => {
    try {
      const response = await fetch(`http://${configuration.host}:${configuration.anvilPort}/ping`);
      return response.ok;
    } catch {
      return false
    }
  }

  const execute = async (pipelineSpecs, executionId) => {
    try {
      const rebuild = (action == "Rebuild")
      await executePipeline.mutateAsync({
        id: pipeline.id,
        executionId: executionId,
        specs: pipelineSpecs,
        path: pipeline.path,
        buffer: pipeline.buffer,
        name: pipeline.name,
        rebuild: rebuild,
        anvilConfiguration: configuration,
      });
      return true
    } catch (error) {
      console.error(`Pipeline execution failed: ${error}`)
      setValidationErrorMsg(["Pipeline exectuion failed"])
      setIsOpen(true)
      return false
    }
  }

  const validateSchema = () => {
    const schema = generateSchema(pipeline.data);
    const results = schema.safeParse(pipeline.data);

    if (results.success) {
      return true;
    } else {
      setValidationErrorMsg(() => {
        return results.error.issues.map(block => `${block.path[0]}: ${block.message}`)
      })
      setIsOpen(true)
      return false;
    }
  }

  const trackMixpanelRunCreated = () => {
      try {
        mixpanelService.trackEvent('Run Created')
      } catch (err) {
        console.error("Mixpanel run tracking failed");
      }
  }

  const styles = {
    margin: '5px',
  };


  return (
    <>
      <Button style={styles} size="sm" onClick={() => runPipeline()}>
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
