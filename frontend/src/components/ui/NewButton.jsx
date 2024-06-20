import { drawflowEditorAtom } from "@/atoms/drawflowAtom";
import { pipelineAtom, workspaceAtom, pipelineFactory, pipelineKey } from "@/atoms/pipelineAtom";
import { HeaderMenuItem } from "@carbon/react";
import { useAtom } from "jotai";
import { useImmerAtom } from 'jotai-immer'

export default function NewButton() {
  const [editor] = useAtom(drawflowEditorAtom);
  const [workspace, setWorkspace] = useImmerAtom(workspaceAtom);

  const handleClick = async (editor, pipeline) => {
    const newPipeline = pipelineFactory(window.cache.local)
    const key = pipelineKey(newPipeline.id, null)
    setWorkspace((draft) => {
      draft.tabs[key] = {}
      draft.pipelines[key] = newPipeline
      draft.active = key
    })

  };

  return (
    <div>
      <HeaderMenuItem onClick={() => handleClick(editor)}>New</HeaderMenuItem>
    </div>
  );
}
