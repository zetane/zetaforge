import { HeaderMenuItem } from "@carbon/react";
import { useRef } from "react";
import { pipelineAtom } from "@/atoms/pipelineAtom";
import { customAlphabet } from "nanoid";
import { distinctIdAtom } from "@/atoms/distinctIdAtom";
import { useImmerAtom } from 'jotai-immer'
import { trpc } from "@/utils/trpc"
//import mixpanel from '@/components/mixpanel'

export default function LoadBlockButton() {
  const FILE_EXTENSION_REGEX = /\.[^/.]+$/;
  const [pipeline, setPipeline] = useImmerAtom(pipelineAtom)
  const [distinctId, setDistinctId] = useImmerAtom(distinctIdAtom)

  const fileInput = useRef();

  const selectFile = () => {
    fileInput.current.click();
  };

  const addBlockToPipeline = (block) => {
    const nanoid = customAlphabet('1234567890abcedfghijklmnopqrstuvwxyz', 12)
    const newNanoid = nanoid()
    const id = `${block.information.id}-${newNanoid}`
    setPipeline((draft) => {
      draft.data[id] = block;
    })
    return id;
  }

  const getDistinctId = trpc.getDistinctId.useMutation();

  const loadBlock = async (pipeline) => {
    let data = distinctId?.distinctId

    if (data === "0" || data === undefined) {

      const res = await getDistinctId.mutateAsync({ distinctId: "0" }) //ignore the input, it'll just mutate the new distinct id

      data = res.distinctId

      setDistinctId((draft) => {
        draft.distinctId = data
      })
    } try {
      //mixpanel.track('Load Block', {
      //  'distinct_id': data,
      //})
    } catch (error) {
      //ignore the error, no logs
    }
    const files = fileInput.current.files
    for (const key in files) {
      const file = files[key]
      const name = removeFileExtension(file.name)
      if (name === "specs_v1") {
        const spec = JSON.parse(await (new Blob([file])).text())
        addBlockToPipeline(spec)

        break;
      }
    }
  };

  const removeFileExtension = (fileName) => {
    return fileName.replace(FILE_EXTENSION_REGEX, "");
  };

  return (
    <div>
      <HeaderMenuItem onClick={selectFile}>Block</HeaderMenuItem>
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
