import { drawflowEditorAtom } from '@/atoms/drawflowAtom';
import { blockEditorRootAtom, isBlockEditorOpenAtom } from '@/atoms/editorAtom';
import { pipelineAtom, workspaceAtom } from "@/atoms/pipelineAtom";
import { pipelineConnectionsAtom } from "@/atoms/pipelineConnectionsAtom";
import Drawflow from '@/components/ZetaneDrawflowEditor';
import BlockGenerator from '@/components/ui/blockGenerator/BlockGenerator';
import { generateId, replaceIds } from '@/utils/blockUtils';
import { trpc } from "@/utils/trpc";
import '@fortawesome/fontawesome-free/css/all.min.css';
import { useAtom, useSetAtom } from 'jotai';
import { useImmerAtom } from 'jotai-immer';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useLoadPipeline } from "./useLoadPipeline";
import { createConnections } from '@/utils/createConnections';

const launchDrawflow = (parentDomRef, canvasDomRef, pipeline, setPipeline, connection_list, setConnectionList) => {
  if (parentDomRef.className != "parent-drawflow") {
    const editor = new Drawflow(parentDomRef, pipeline, setPipeline, canvasDomRef, connection_list, setConnectionList);

    editor.reroute = true;
    editor.reroute_fix_curvature = true;
    editor.force_first_input = false;

    // Start the editor
    editor.start();
    return editor;
  }
  return null;
};

const dragOverHandler = (event) => {
  event.preventDefault()
};

export default function DrawflowWrapper() {
  const [editor, setEditor] = useAtom(drawflowEditorAtom);
  const [pipeline, setPipeline] = useImmerAtom(pipelineAtom);
  const [pipelineConnections, setPipelineConnections] = useImmerAtom(pipelineConnectionsAtom);
  const setBlockEditorRoot = useSetAtom(blockEditorRootAtom);
  const setEditorOpen = useSetAtom(isBlockEditorOpenAtom);
  const [renderNodes, setRenderNodes] = useState([])
  const drawflowCanvas = useRef(null);
  const pipelineRef = useRef(null)

  pipelineRef.current = pipeline

  const savePipeline = trpc.savePipeline.useMutation();
  const getBlockPath = trpc.getBlockPath.useMutation();

  const handleDrawflow = useCallback((node) => {
    if (!node) { return }
    const constructedEditor = launchDrawflow(node, drawflowCanvas.current, pipeline, setPipeline, pipelineConnections, setPipelineConnections);
    if (constructedEditor) {
      setEditor(constructedEditor);
    }
  }, []);

  useEffect(() => {
    const blocks = pipeline?.data || {}
    const nodes = Object.entries(blocks).map(([key, block]) => {
      const uniqueKey = pipeline.history + "/" + key
      return (<BlockGenerator key={uniqueKey}
                block={block}
                openView={openView}
                id={key}
                history={pipeline.history}
                />)
    })

    setRenderNodes(nodes)
  }, [pipeline?.data])

  useEffect(() => {
    if (editor) {
      editor.pipeline = pipeline;
      editor.connection_list = pipelineConnections
      editor.addConnection()
      editor.updateAllConnections()
    }
  }, [pipelineConnections])

  useEffect(() => {
    const newConnections = createConnections(pipeline?.data)
    if (editor) {
      editor.syncConnections(newConnections)
    }
    setPipelineConnections(draft => draft = newConnections)

    const syncData = async () => {
      try {
        if (Object.getOwnPropertyNames(pipeline?.data).length !== 0) {
          const pipelineSpecs = editor.convert_drawflow_to_block(pipeline.name, pipeline.data);
          // note that we are writing to the buffer, not the load path
          pipelineSpecs['sink'] = pipeline.buffer;
          pipelineSpecs['build'] = pipeline.buffer;

          const saveData = {
            specs: pipelineSpecs,
            name: pipeline?.name,
            buffer: pipeline?.buffer,
            writePath: pipeline?.buffer,
          };

          await savePipeline.mutateAsync(saveData);
        }
      } catch (error) {
        console.error("Error saving pipeline:", error);
      }
    };

    syncData();
  }, [renderNodes])

  const addBlockToPipeline = (block) => {
    const id = generateId(block);
    block = replaceIds(block, id);
    setPipeline((draft) => {
      draft.data[id] = block;
    })
    return id;
  }

  const dropHandler = async (event, editor) => {
    // Loads block to graph
    event.preventDefault()

    if (editor?.ele_selected?.classList[0] === 'input-element') {
      return;
    }

    const jsonData = event.dataTransfer.getData("block");
    const spec = JSON.parse(jsonData)
    const block = setBlockPos(editor, spec, event.clientX, event.clientY)
    addBlockToPipeline(block)
  };

  const setBlockPos = (editor, block, posX, posY) => {
    if (editor.editor_mode === "fixed") {
      return block;
    }
    block.views.node.pos_x =
      posX *
        (editor.precanvas.clientWidth /
          (editor.precanvas.clientWidth * editor.zoom)) -
      editor.precanvas.getBoundingClientRect().x *
        (editor.precanvas.clientWidth /
          (editor.precanvas.clientWidth * editor.zoom));
    block.views.node.pos_y =
      posY *
        (editor.precanvas.clientHeight /
          (editor.precanvas.clientHeight * editor.zoom)) -
      editor.precanvas.getBoundingClientRect().y *
        (editor.precanvas.clientHeight /
          (editor.precanvas.clientHeight * editor.zoom));

    return block
  }
  const openView = async (id) => {
    const root = await getBlockPath.mutateAsync({
      blockId: id,
      pipelinePath: pipeline.buffer
    });
    setBlockEditorRoot(root);
    setEditorOpen(true);
  };


  const loadPipeline = useLoadPipeline();

  // Similar to LoadPipelineButton.jsx
  const handleFileChange = async (event, editor) => {
    const file = event.target.files[0];
    if (file) {
      await loadPipeline(file);
      event.target.value = ''; // Reset the file input
    }
  };

  const fileInput = useRef();

  return (
    <div
      id="drawflow"
      ref={handleDrawflow}
      onDrop={(ev) => {
        const blockData = ev.dataTransfer.getData("block");
        const pipelineData = ev.dataTransfer.getData("pipeline");
        if (blockData) {
          dropHandler(ev, editor);
        } else if (pipelineData) {
          const pipelineJson = JSON.parse(pipelineData);
          const file = new File([JSON.stringify(pipelineJson)], pipelineJson.name, {
            type: "application/json",
          });
          loadPipeline(file);
        }
      }}
      onDragOver={(ev) => { dragOverHandler(ev) }}
    >
      <div ref={drawflowCanvas} >
        {renderNodes}
      </div>
      <input
        type="file"
        ref={fileInput}
        onChange={(event) => handleFileChange(event, editor)}
        style={{ display: 'none' }}
      />

    </div>
  );
}
