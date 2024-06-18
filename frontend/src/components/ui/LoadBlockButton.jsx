import { getDirectoryPath } from "@/../utils/fileUtils";
import { drawflowEditorAtom } from "@/atoms/drawflowAtom";
import { mixpanelAtom } from "@/atoms/mixpanelAtom";
import { getPipelineFormat, pipelineAtom } from "@/atoms/pipelineAtom";
import { generateId, replaceIds } from "@/utils/blockUtils";
import { trpc } from "@/utils/trpc";
import { HeaderMenuItem } from "@carbon/react";
import { useAtom } from "jotai";
import { useImmerAtom } from 'jotai-immer';
import { useRef } from "react";

export default function LoadBlockButton() {
  const [pipeline, setPipeline] = useImmerAtom(pipelineAtom)
  const [mixpanelService] = useAtom(mixpanelAtom)
  const [editor] = useAtom(drawflowEditorAtom)

  const fileInput = useRef();

  const selectFile = () => {
    fileInput.current.click();
  };

  const saveBlockMutation = trpc.saveBlock.useMutation();

  const addBlockToPipeline = async (block, path) => {
    const id = generateId(block);
    block = replaceIds(block, id)
    block = centerBlockPosition(block)
    block = removeConnections(block);
    const newPipeline = getPipelineFormat(pipeline)
    let newPipelineData = JSON.parse(JSON.stringify(pipeline.data))
    newPipelineData[id] = block
    newPipeline.pipeline = newPipelineData

    const cacheData = {
      pipelineSpec: newPipeline,      
      blockSpec: block,
      blockId: id,
      blockPath: path,
      pipelinePath: pipeline.buffer
    }
    const res = await saveBlockMutation.mutateAsync(cacheData)

    setPipeline((draft) => {
      draft.data[id] = block;
    })
    return id;
  }

  const loadBlock = async (pipeline) => {
    try {
      mixpanelService.trackEvent('Load Block')
    } catch (err) {

    }
    const files = fileInput.current.files
    for (let i = 0; i < files.length; i++) {
      const file = files.item(i)
      let relPath = file.webkitRelativePath
      relPath = relPath.replaceAll('\\', '/')
      const parts = relPath.split("/")
      if (parts.length == 2) {
        const name = parts[1]
        if (isSpecsFile(name)) {
          const spec = JSON.parse(await (new Blob([file])).text())
          let folderPath = getDirectoryPath(file.path)
          folderPath = folderPath.replaceAll('\\', '/')

          await addBlockToPipeline(spec, folderPath)

          fileInput.current.value = ''
          break;
        }
      }
    }
  };

  const centerBlockPosition = (block) => {
    block.views.node.pos_x = ((editor.precanvas.clientWidth / 2) - editor.precanvas.getBoundingClientRect().x) / editor.zoom;
    block.views.node.pos_y = ((editor.precanvas.clientHeight / 2) - editor.precanvas.getBoundingClientRect().y) / editor.zoom;
    return block;
  }

  const removeConnections = (block) => {
    for (const k of ["inputs", "outputs"]) {
      for (const ioKey in block[k]) {
        block[k][ioKey].connections = [];
      }
    }
    return block;
  }

  const isSpecsFile = (fileName) => {
    return fileName.startsWith("specs") && fileName.endsWith('.json')
  } 

  return (
    <div>
      <HeaderMenuItem onClick={selectFile}>Load Block</HeaderMenuItem>
      <input
        type="file"
        webkitdirectory=""
        directory=""
        ref={fileInput}
        onChange={(e) => { loadBlock(pipeline) }}
        hidden
      />
    </div>
  );
}
