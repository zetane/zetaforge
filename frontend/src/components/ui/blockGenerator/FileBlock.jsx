import { useEffect, useRef, useState } from "react";
import { trimQuotes } from "@/utils/blockUtils";

export const FileBlock = ({blockId, block, setFocusAction, history}) => {
  const fileInput = useRef();
  const [renderPath, setRenderPath] = useState(null)

  useEffect(() => {
    const type = block?.action?.parameters['path']?.type
    if (history && type != "fileLoad") {
      let fileName = block?.action?.parameters["path"]?.value
      const fileSplit = fileName.split("/")
      if (fileSplit.length > 1) {
        fileName = fileSplit.at(-1)
      }
      fileName = trimQuotes(fileName)
      const s3Url = history + "/" + fileName
      setFocusAction((draft) => {
        draft.data[blockId].action.parameters['path'].value = s3Url
        draft.data[blockId].action.parameters['path'].type = "blob"
      })
      setRenderPath(fileName)
    }
  }, [block])

  const loadFile = async (e) => {
    const files = fileInput.current.files
    const file = files[0]
    const value = file.path.toString()
    setFocusAction((draft) => {
      draft.data[blockId].action.parameters['path'].value = value
      draft.data[blockId].action.parameters['path'].type = "fileLoad"
    })
    setRenderPath(value)
  }

  return (
    <div className="block-content">
      <div className="mb-2 pl-2">{renderPath}</div>
      <input
        id="file-block"
        type="file"
        ref={fileInput}
        onChange={(e) => { loadFile(e) }}
        parameters-path="true"
      />
    </div>
  )
}
