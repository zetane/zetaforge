import { modalContentAtom } from "@/atoms/modalAtom";
import { darkModeAtom } from "@/atoms/themeAtom";
import { pipelineAtom, pipelineFactory, workspaceAtom } from "@/atoms/pipelineAtom";
import { Play, Password, Renew } from "@carbon/icons-react";
import {
  Header,
  HeaderGlobalBar,
  HeaderMenu,
  HeaderMenuItem,
  HeaderName,
  HeaderNavigation,
  SkipToContent,
} from "@carbon/react";
import { useAtom, useSetAtom } from "jotai";
import LoadBlockButton from "./LoadBlockButton";
import LoadPipelineButton from "./LoadPipelineButton";
import LogsButton from "./LogsButton";
import NewButton from "./NewButton";
import ApiKeysModal from "./modal/ApiKeysModal";
import PipelinesButton from "./PipelinesButton";
import WorkspaceTabs from "./WorkspaceTabs";
import { useEffect } from "react";
import { useImmerAtom } from "jotai-immer";
import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import { useLoadServerPipeline } from "./useLoadPipeline";
import RunPipelineButton from "./RunPipelineButton";
import SaveAsPipelineButton from "./SaveAsPipelineButton";
import SavePipelineButton from "./SavePipelineButton";
import AnvilConfigurationsModal from "./modal/AnvilConfigurationsModal";
import { activeConfigurationAtom } from "@/atoms/anvilConfigurationsAtom";
import { PipelineStopButton } from "./PipelineStopButton";

export default function Navbar({ children }) {
  const [darkMode, setDarkMode] = useAtom(darkModeAtom);
  const [modalContent, setModalContent] = useAtom(modalContentAtom);
  const [workspace, setWorkspace] = useImmerAtom(workspaceAtom);
  const [pipeline, setPipeline] = useImmerAtom(pipelineAtom);
  const [configuration] = useAtom(activeConfigurationAtom);
  const loadPipeline = useLoadServerPipeline();

  const { pending, error, data } = useQuery({
    queryKey: ['pipelines'],
    queryFn: async () => {
      const res = await axios.get(`http://${configuration.host}:${configuration.anvilPort}/pipeline/filter?limit=100000&offset=0`)
      return res.data;
    },
    refetchInterval: workspace.fetchInterval
  })

  useEffect(() => {
    const pipelines = data ?? []
    setWorkspace((draft) => {
      for (const serverPipeline of pipelines) {
        const loaded = loadPipeline(serverPipeline, configuration)
        const key = loaded.id + "." + loaded.record.Execution
        const current = workspace.pipelines[key]
        if (current?.record.Results || current?.record?.Status == "Failed" || current?.record?.Status == "Succeeded" || current?.record?.Status == "Error") {
          continue
        }
        draft.pipelines[key] = loaded
        draft.executions[loaded.record.Execution] = loaded
      }
    })
  }, [data])

  const modalPopper = (content) => {
    setModalContent({
      ...modalContent,
      show: true,
      content: content,
    });
  };

  const svgOverride = { position: 'absolute', right: '15px', top: '5px' }

  let runButton =  (
    <RunPipelineButton modalPopper={modalPopper} action="Run">
      <Play size={20} style={svgOverride} />
    </RunPipelineButton>
  )

  if (pipeline?.record?.Status == "Running" || pipeline?.record?.Status == "Pending") {
    runButton = (
      <PipelineStopButton executionId={pipeline?.record?.Execution} configuration={configuration}/>
    )
  }

  return (
    <Header aria-label="ZetaForge" className="flex flex-wrap">
      <SkipToContent />
      <HeaderName prefix="" className="select-none">
        ZetaForge
      </HeaderName>
      <HeaderNavigation aria-label="ZetaForge">
        <HeaderMenu menuLinkName="File" aria-label="File">
          <NewButton />
          <SavePipelineButton />
          <SaveAsPipelineButton />
          <LoadPipelineButton />
          <LoadBlockButton />
        </HeaderMenu>
        <HeaderMenu menuLinkName="Settings" aria-label="Settings">
          <HeaderMenuItem
            onClick={() => modalPopper(<ApiKeysModal />)}>
            <Password size={16} className="mx-1 align-middle"></Password>
            <span>API Keys</span>
          </HeaderMenuItem>
          <HeaderMenuItem
            onClick={() => modalPopper(<AnvilConfigurationsModal />)}>
            Anvil Configurations
          </HeaderMenuItem>
          <HeaderMenuItem label="Theme" onClick={() => setDarkMode(!darkMode)}>
            Toggle Theme
          </HeaderMenuItem>
        </HeaderMenu>
        <HeaderMenu menuLinkName="Help" aria-label="Help">
            <HeaderMenuItem onClick={() => window.open('https://github.com/zetane/zetaforge')}>
              GitHub
            </HeaderMenuItem>
            <HeaderMenuItem onClick={() => window.open('https://discord.gg/zetaforge')}>
              Discord
            </HeaderMenuItem>
            <HeaderMenuItem onClick={() => window.open('https://zetane.com/docs/')}>
              Docs
            </HeaderMenuItem>
        </HeaderMenu>
      </HeaderNavigation>
      <HeaderGlobalBar>
        { runButton }
        <RunPipelineButton modalPopper={modalPopper} action="Rebuild">
          <Renew size={20} style={svgOverride} />
        </RunPipelineButton>
        <LogsButton />
        <PipelinesButton />
      </HeaderGlobalBar>
      <WorkspaceTabs />
      {children}
    </Header>
  );
}
