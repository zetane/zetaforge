import { drawflowEditorAtom } from "@/atoms/drawflowAtom";
import { mixpanelAtom } from "@/atoms/mixpanelAtom";
import { pipelineAtom } from "@/atoms/pipelineAtom";
import generateSchema from '@/utils/schemaValidation';
import { trpc } from "@/utils/trpc";
import { Button } from "@carbon/react";
import { useMutation } from "@tanstack/react-query";
import axios from "axios";
import { useAtom } from "jotai";
import { useImmerAtom } from "jotai-immer";
import { useRef, useState } from "react";
import { uuidv7 } from "uuidv7";
import ClosableModal from "./modal/ClosableModal";
import { activeConfiguration } from "@/atoms/anvilHost";

export default function RunPipelineButton({ modalPopper, children, action }) {
  const [editor] = useAtom(drawflowEditorAtom);
  const [pipeline, setPipeline] = useImmerAtom(pipelineAtom);
  const [validationErrorMsg, setValidationErrorMsg] = useState([]);
  const [isOpen, setIsOpen] = useState(false);
  const [mixpanelService] = useAtom(mixpanelAtom)
  const [configuration] = useAtom(activeConfiguration);

  const uploadParameterBlocks = trpc.uploadParameterBlocks.useMutation();

  const mutation = useMutation({
    mutationFn: async (execution) => {
      return axios.post(`http://${configuration.host}:${configuration.anvilPort}/execute`, execution)
    },
  })

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
        pipeline: pipelineSpecs,
        build: rebuild
      }

      const res = await mutation.mutateAsync(execution)
      if (res.status == 201) {
        setPipeline((draft) => {
          draft.socketUrl = `ws://${configuration.host}:${configuration.anvilPort}/ws/${pipelineSpecs.id}`;
          draft.history = pipeline.id + "/" + res.data.executionId
          draft.saveTime = Date.now()
          draft.log = []
        })
      }
      try {
        mixpanelService.trackEvent('Run Created')
      } catch (err) {

      }

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
