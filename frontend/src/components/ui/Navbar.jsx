import { modalContentAtom } from "@/atoms/modalAtom";
import { darkModeAtom } from "@/atoms/themeAtom";
import { pipelineAtom } from "@/atoms/pipelineAtom";
import { Play, Password, Renew } from "@carbon/icons-react";
import {
  Header,
  HeaderGlobalAction,
  HeaderGlobalBar,
  HeaderMenu,
  HeaderMenuItem,
  HeaderName,
  HeaderNavigation,
  SkipToContent
} from "@carbon/react";
import { useAtom } from "jotai";
import LoadBlockButton from "./LoadBlockButton";
import LoadPipelineButton from "./LoadPipelineButton";
import PipelineNameLabel from "./PipelineNameLabel";
import SavePipelineButton from "./SavePipelineButton";
import SaveAsPipelineButton from "./SaveAsPipelineButton";
import RunPipelineButton from "./RunPipelineButton";
import GetEndpointButton from "./GetEndpointButton";
import LogsButton from "./LogsButton";
import NewButton from "./NewButton";
import ApiKeysModal from "./modal/ApiKeysModal";
import useWebSocket, {ReadyState} from "react-use-websocket";
import { useEffect } from "react";
import { useImmerAtom } from "jotai-immer";
import { PipelineLogs } from "./PipelineLogs";

export default function Navbar({ children }) {
  const [darkMode, setDarkMode] = useAtom(darkModeAtom);
  const [modalContent, setModalContent] = useAtom(modalContentAtom);
  const [pipeline, setPipeline] = useImmerAtom(pipelineAtom);

  const modalPopper = (content) => {
    setModalContent({
      ...modalContent,
      show: true,
      content: content,
    });
  };

  const svgOverride = { position: 'absolute', right: '15px', top: '5px'}

  const { sendMessage, lastMessage, readyState } = useWebSocket(
    pipeline.socketUrl,
    {
      share: true,
      shouldReconnect: () => false,
    }
  );

  useEffect(() => {
    if (lastMessage !== null) {
      setPipeline((draft) => {
        const mess = JSON.parse(lastMessage.data).content
        const splitMess = mess.split("::::")
        // slices off the []
        const pod = splitMess[0].slice(1, -1)
        const key = pod.split("-").slice(1,).join("-")
        if (draft.data[key]) {
          const node = draft.data[key]
          const message = splitMess[1].trim()
          const tagAndObject = message.split("|||")
          const tag = tagAndObject[0].trim()

          if (tag == "outputs") {
            try {
              const outs = JSON.parse(tagAndObject[1]);
              if (outs && typeof outs === 'object') { // Ensure outs is an object
                for (const [key, value] of Object.entries(outs)) {
                  if (!node.events.outputs) {
                    node.events["outputs"] = {};
                  }
                  node.events.outputs[key] = value;
                }
              }
            } catch (err) {
              console.error('Failed to parse outputs:', err);
            }
          }
          if (tag == "inputs") {
            try {
              const outs = JSON.parse(tagAndObject[1]);
              if (outs && typeof outs === 'object') { // Ensure outs is an object
                for (const [key, value] of Object.entries(outs)) {
                  if (!node.events.inputs) {
                    node.events["inputs"] = {};
                  }
                  node.events["inputs"][key] = value;
                }
              }
            } catch (err) {
              console.error('Failed to parse inputs:', err);
            }
          }

        }
        draft.log = draft.log.concat(`${mess}\n`)
      })
    }
  }, [lastMessage]);

  useEffect(() => {
    if (readyState === ReadyState.OPEN) {
      if (pipeline.socketUrl) {
        modalPopper(<PipelineLogs />)
      }
    } else if (readyState === ReadyState.CLOSED) {
      setPipeline((draft) => {
        draft.socketUrl = null;
      })
    }
  }, [readyState]);

  return (
    <Header aria-label="ZetaForge">
      <SkipToContent />
      <HeaderName prefix="" className="select-none">
        ZetaForge
      </HeaderName>
      <HeaderNavigation aria-label="ZetaForge">
        <HeaderMenu menuLinkName="File">
          <NewButton />
          <SavePipelineButton />
          <SaveAsPipelineButton />
            <LoadPipelineButton  />
            <LoadBlockButton />
        </HeaderMenu>
        <HeaderMenu menuLinkName="Settings">
          <HeaderMenuItem
          onClick={() => modalPopper(<ApiKeysModal />)}>
            <Password  size={16} className="mx-1 align-middle"></Password>
            <span>API Keys</span>
          </HeaderMenuItem>
          <HeaderMenuItem label="Theme" onClick={() => setDarkMode(!darkMode)}>
            Toggle Theme
          </HeaderMenuItem>
        </HeaderMenu>
        <HeaderMenu menuLinkName="Help">
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
        <RunPipelineButton modalPopper={modalPopper} action="Run">
          <Play size={20} style={svgOverride} />
        </RunPipelineButton>
        <GetEndpointButton modalPopper={modalPopper} action="Something">
          <Play size={20} style={svgOverride} />
        </GetEndpointButton>

        <RunPipelineButton modalPopper={modalPopper} action="Rebuild">
          <Renew size={20} style={svgOverride} />
        </RunPipelineButton>
        <PipelineNameLabel />
        <LogsButton />
      </HeaderGlobalBar>
      {children}
    </Header>
  );
}
