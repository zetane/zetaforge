import { blockEditorRootAtom, isBlockEditorOpenAtom } from "@/atoms/editorAtom";
import { pipelineAtom } from "@/atoms/pipelineAtom";
import {
  Close,
  Maximize,
  Minimize
} from "@carbon/icons-react";
import {
  IconButton,
  Tab,
  TabList,
  TabPanel,
  TabPanels,
  Tabs
} from "@carbon/react";
import { useAtom, useSetAtom } from "jotai";
import { useState } from "react";
import DirectoryViewer from "./DirectoryViewer";
import SpecsInterface from "./SpecsInterface";
import TestLogs from "./TestLogs";

export default function Editor({blockKey, blockPath}) {
  const minizedStyles = "inset-y-16 right-0 w-1/2"
  const maximizedStyles = "inset-y-11 right-0 w-full"
  const [pipeline] = useAtom(pipelineAtom);
  const blockName = pipeline.data[blockKey].information.name;
  const blockLogs = `${blockPath}/logs.txt`
  const setBlockEditorOpen = useSetAtom(isBlockEditorOpenAtom);
  const [isMaximized, setMaximized] = useState(false)


  const handleClose = () => {
    setBlockEditorOpen(false);
  };

  const toggleMaximize = () => {
    setMaximized((prev) => !prev)
  }

  return (
    <div className={"editor-block absolute flex flex-col z-[8000] " + (isMaximized ? maximizedStyles : minizedStyles)}>
      <div className="block-editor-header">
        <div className='p-4'>
          <p className='text-lg italic'>{blockName}</p>
          <p className="text-sm">{blockKey}</p>
        </div>
        <div className="flex flex-row items-center justify-end">
          <IconButton kind="ghost" size="lg" className="my-px-16" onClick={toggleMaximize} label="Maximize">
            {isMaximized ? <Minimize size={24} /> : <Maximize size={24} />}
          </IconButton>
          <IconButton kind="ghost" size="lg" onClick={handleClose} label="Close">
            <Close size={24} />
          </IconButton>
        </div>
      </div>
      <Tabs>
        <TabList fullWidth className='shrink-0 max-w-[40rem] mx-auto' aria-label='Editor tabs mb-1'>
          <Tab>
            Files
          </Tab>
          <Tab>
            Specs
          </Tab>
          <Tab>
            Test Block
          </Tab>
        </TabList>
        <TabPanels>
        <TabPanel className="overflow-hidden">
            <DirectoryViewer
              blockPath={blockPath}
              blockKey={blockKey}
            />
          </TabPanel>
          <TabPanel className="overflow-y-auto">
            <SpecsInterface key={blockKey} blockPath={blockPath} blockKey={blockKey} />
          </TabPanel>
          <TabPanel className="overflow-hidden">
            <TestLogs
              filePath={blockLogs}
              blockPath={blockPath}
              blockKey={blockKey}
            />
          </TabPanel>
        </TabPanels>
      </Tabs>
    </div>
  );
}
