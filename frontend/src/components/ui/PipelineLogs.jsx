import { LogsCodeMirror } from "@/components/ui/blockEditor/CodeMirrorComponents";
import ClosableModal from "./modal/ClosableModal";
import { pipelineAtom } from "@/atoms/pipelineAtom";
import { useAtom, useAtomValue } from "jotai";
import ScrollToBottom from 'react-scroll-to-bottom';
import useWebSocket, { ReadyState } from "react-use-websocket";
import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import { getFileData } from "@/utils/s3";
import { activeConfigurationAtom } from "@/atoms/anvilConfigurationsAtom";
import { parseLog } from "@/components/ui/useLoadPipeline";

export const PipelineLogs = () => {
  const [configuration, _] = useAtom(activeConfigurationAtom)
  const pipeline = useAtomValue(pipelineAtom);
  const socket = pipeline?.socketUrl || null

  const { pending, error, data } = useQuery({
    queryKey: ['logs', pipeline?.history],
    queryFn: async () => {
      return await getFileData(pipeline?.record?.LogPath, configuration)
    },
    enabled: (pipeline?.record?.LogPath != null)
  })
  let log = pipeline.log
  if (data) {
    log = parseLog(data.split("\n"))
  }

  /*
  const { sendMessage, lastMessage, readyState } = useWebSocket(
    socket,
    {
      share: true,
      shouldReconnect: () => false,
    }
  );

  useEffect(() => {
    if (readyState === ReadyState.OPEN) {
      if (pipeline.socketUrl) {
      }
    } else if (readyState === ReadyState.CLOSED) {
    }
  }, [readyState]);

  useEffect(() => {
    if (lastMessage !== null) {
      const content = JSON.parse(lastMessage.data).content
      const {executionId, blockId, message, time, ...jsonObj} = JSON.parse(content)

      setPipeline((draft) => {
        let shouldLog = true

        if (draft.data[blockId]) {
          const node = draft.data[blockId]
          const tagAndObject = message.split("|||")
          const tag = tagAndObject[0].trim()

          if (tag == "debug") {
            shouldLog = false
          }
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

        if (shouldLog) {
          let logString = `[${time}][${executionId}] ${message}`
          if (blockId) {
            logString = `[${time}][${executionId}][${blockId}] ${message}`
          }
          //draft.log.push(logString)
        }
      })
    }
  }, [lastMessage]);

  */

  return (
    <ClosableModal
      modalHeading="Pipeline Logs"
      passiveModal={true}
      modalClass="custom-modal-size"
    >
      <ScrollToBottom className="viewer-container">
        <div className="logs-viewer">
          <LogsCodeMirror code={log.join("\n")} />
        </div>
      </ScrollToBottom>
    </ClosableModal>
  );
};
