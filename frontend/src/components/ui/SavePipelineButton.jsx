import { drawflowEditorAtom } from "@/atoms/drawflowAtom";
import { pipelineAtom } from "@/atoms/pipelineAtom";
import { mixpanelAtom } from "@/atoms/mixpanelAtom";
import { HeaderMenuItem } from "@carbon/react";
import { useAtom } from "jotai";
import { trpc } from "@/utils/trpc"
import { useImmerAtom } from 'jotai-immer'

export default function SavePipelineButton() {
  const [editor] = useAtom(drawflowEditorAtom);
  const [pipeline, setPipeline] = useImmerAtom(pipelineAtom);
  const [mixpanelService] = useAtom(mixpanelAtom)

  const savePipeline = trpc.savePipeline.useMutation();

  const handleClick = async (editor, pipeline) => {
    try {
      mixpanelService.trackEvent('Save Pipeline')
     } catch(err) {

     }
    const pipelineSpecs = editor.convert_drawflow_to_block(pipeline.name, pipeline.data);
    // If a pipeline is loaded, pipeline.path will be set to the load path
    // If it isn't set, electron will pop a file picker window
    // The response from the server after saving will contain that new path
    // TODO: the pipelineAtom data and these fields are redundant
    // They should be consolidated
    pipelineSpecs['sink'] = pipeline.path ? pipeline.path : pipeline.buffer
    pipelineSpecs['build'] = pipeline.buffer
    pipelineSpecs['name'] = pipeline.name
    pipelineSpecs['id'] = pipeline.id
    const saveData = {
      specs: pipelineSpecs,
      name: pipeline.name,
      buffer: pipeline.buffer,
      writePath: pipeline.path
    }

    const response = await savePipeline.mutateAsync(saveData)
    const { name, dirPath, specs } = response

    setPipeline((draft) => {
      draft.saveTime = Date.now()
      if (name) {
        draft.name = name
      }
      if (dirPath) {
        draft.path = dirPath
      }
    })


  };

  return (
    <div>
      <HeaderMenuItem onClick={() => handleClick(editor, pipeline)}>Save</HeaderMenuItem>
    </div>
  );
}
