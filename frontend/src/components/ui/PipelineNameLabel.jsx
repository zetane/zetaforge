import { pipelineAtom } from "@/atoms/pipelineAtom";
import { TextInput } from "@carbon/react";
import { useState, useMemo } from "react";
import { Save } from "@carbon/icons-react"
import { Unsaved } from "@carbon/icons-react"
import { useImmerAtom } from "jotai-immer";
import { workspaceAtom } from "@/atoms/pipelineAtom";

export default function PipelineNameLabel() {
  const [pipeline, setPipeline] = useImmerAtom(pipelineAtom);
  const [workspace, _] = useImmerAtom(workspaceAtom)
  const [editing, setEditing] = useState(false);

  console.log("wha: ", pipeline)

  let saveIcon = null;
  let saveStyles = { marginLeft: '5px;' }
  if (pipeline?.saveTime) {
    const niceTime = new Date(pipeline.saveTime).toString()
    saveIcon = (<Save className="pl-2" size={30} title={niceTime} />)
  } else {
    saveIcon = (<Unsaved className="pl-2" size={30} title="Not saved" />)
  }

  return (
    <>
      <div>
        <TextInput size="sm"
          disabled={true}
          readOnly={true}
          placeholder={pipeline?.name}
          defaultValue={pipeline?.name}
          >
        </TextInput>
      </div>
    </>
  );
}
