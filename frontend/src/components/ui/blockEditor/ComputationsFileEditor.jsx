import { openAIApiKeyAtom } from '@/atoms/apiKeysAtom';
import { compilationErrorToastAtom } from '@/atoms/compilationErrorToast';
import { drawflowEditorAtom } from '@/atoms/drawflowAtom';
import { blockEditorRootAtom } from "@/atoms/editorAtom";
import { pipelineAtom } from '@/atoms/pipelineAtom';
import { updateSpecs } from '@/utils/specs';
import { trpc } from '@/utils/trpc';
import {
  Bot,
  Edit,
  Save,
  SendFilled
} from "@carbon/icons-react";
import {
  Button,
  IconButton,
  Loading,
  RadioButton
} from "@carbon/react";
import { useAtom } from "jotai";
import { useImmerAtom } from 'jotai-immer';
import { Fragment, useEffect, useRef, useState } from "react";
import { EditorCodeMirror, ViewerCodeMirror } from "./CodeMirrorComponents";


export default function ComputationsFileEditor({ fetchFileSystem }) {
  const serverAddress = "http://localhost:3330";
  const [blockPath] = useAtom(blockEditorRootAtom);
  const relPath = blockPath.replaceAll('\\', '/')
  const blockFolderName = relPath.split("/").pop();
  const [openAIApiKey] = useAtom(openAIApiKeyAtom);
  const [pipeline, setPipeline] = useImmerAtom(pipelineAtom);
  const [editor] = useAtom(drawflowEditorAtom);
  const [,setCompilationErrorToast] = useAtom(compilationErrorToastAtom)

  const [agentName, setAgent] = useState("gpt-4_python_compute");

  const [showEditor, setShowEditor] = useState(false);
  const [editorValue, setEditorValue] = useState("");
  const [editorManualPrompt, setEditorManualPrompt] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const chatTextarea = useRef(null);
  const panel = useRef(null);

  const utils = trpc.useUtils();
  const compileComputation = trpc.compileComputation.useMutation();
  const saveBlockSpecs = trpc.saveBlockSpecs.useMutation();
  const history = trpc.chat.history.get.useQuery({ blockPath });
  const updateHistory = trpc.chat.history.update.useMutation({
    onSuccess(input) {
      utils.chat.history.get.invalidate({ blockPath })
    }
  });
  const index = trpc.chat.index.get.useQuery({ blockPath });
  const updateIndex = trpc.chat.index.update.useMutation({
    onSuccess(input) {
      utils.chat.index.get.invalidate({ blockPath })
    }
  });

  useEffect(() => {
    const init = async () => {
      try {
        const response = await fetch(`${serverAddress}/get-agent`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            blockPath: blockPath,
          }),
        });
        if (response.ok) {
          const agent = await response.json();
          setAgent(agent);
        }
      } catch (error) {
        console.error("Fetch error:", error);
      }
    };
    init();
  }, [blockPath]);

  const recordCode = (promptToRecord, codeToRecord) => {
    updateHistory.mutateAsync({
      blockPath: blockPath,
      history: [
        ...history.data,
        {
          timestamp: Date.now(),
          prompt: promptToRecord,
          response: codeToRecord,
        }
      ]
    })
  };

  const handleEditorChange = (value) => {
    setEditorValue(value);
  };

  const handleSubmit = async (e) => {
    setIsLoading(true);
    e.preventDefault();
    const newPrompt = chatTextarea.current.value.trim();

    const toSend = {
      userMessage: newPrompt,
      agentName: agentName,
      conversationHistory: history.data,
      apiKey: openAIApiKey
    };

    if (newPrompt) {
      try {
        const response = await fetch(`${serverAddress}/api/call-agent`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(toSend),
        });

        const data = await response.json();

        if (response.ok) {
          const only_code_response = data.response;
          recordCode(newPrompt, only_code_response);
        } else {
          throw new Error(data.error || "Server error");
        }
      } catch (error) {
        console.error("Error fetching response:", error);
      }

      chatTextarea.current.value = "";
    }
    setIsLoading(false);
  };

  const handleSave = (e) => {
    if (editorManualPrompt) {
      recordCode(editorManualPrompt, editorValue);
    }
    setShowEditor(false);
    if (panel.current) {
      setTimeout(() => {
        panel.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
      }, 100);
    }
  };

  const handleEdit = (index) => {
    if (index >= 0 && index < history.data.length) {
      setEditorValue(history.data[index].response);
      setEditorManualPrompt("Manual edit of code #" + index);
      setShowEditor(true);
    }

    if (panel.current) {
      setTimeout(() => {
        panel.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
      }, 100);
    }
  };

  const handleGenerate = async (index) => {

    let code_content = history.data[index].response;

    const requestBody = JSON.stringify({
      block_user_name: blockFolderName,
      block_name: blockFolderName,
      agent_name: agentName,
      blockPath: blockPath,
      computations_script: code_content,
      chatHistoryIndex: index
    });

    try {
      const response = await fetch(`${serverAddress}/new-block-react`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: requestBody,
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
    } catch (error) {
      console.error("Request failed: " + error.message);
    }

    try {
      const newSpecsIO = await compileComputation.mutateAsync({ blockPath: blockPath });
      const newSpecs = await updateSpecs(blockFolderName, newSpecsIO, pipeline.data, editor);
      setPipeline((draft) => {
        draft.data[blockFolderName] = newSpecs;
      })
      await saveBlockSpecs.mutateAsync({ blockPath: blockPath, blockSpecs: newSpecs });
    } catch (error) {
      console.error(error)
      setCompilationErrorToast(true);
    }

    updateIndex.mutateAsync({
      blockPath: blockPath,
      index: index
    })

    fetchFileSystem();
  };

  return (
    <div ref={panel} className="flex flex-col gap-y-12">
      {history.isSuccess & index.isSuccess && history.data.map((item, i) => (
        <Fragment key={i}>
          <span className="block-editor-prompt">
            {item.prompt}
          </span>
          <div>
            <div className="flex items-center mb-4">
              <RadioButton
                checked={index.data === i}
                onChange={() => handleGenerate(i)}
                labelText={`Select Code #${i}`}
              />
            </div>
            <div
              className="relative"
              style={{
                border:
                  index.data === i
                    ? "2px solid darkorange"
                    : "none",
              }}
            >
              <ViewerCodeMirror
                code={item.response}
              />
              <div className="absolute right-4 top-4">
                <Button
                  renderIcon={Edit}
                  iconDescription="Edit Code"
                  tooltipPosition="top"
                  hasIconOnly
                  size="md"
                  onClick={() => handleEdit(i)}
                />
              </div>
            </div>
          </div>
        </Fragment>
      ))}
      {showEditor ? (
        <div>
          <div>{editorManualPrompt}</div>
          <div className="relative">
            <EditorCodeMirror
              code={editorValue}
              onChange={handleEditorChange}
            />
            <div className="absolute right-4 top-4">
              <Button
                renderIcon={Save}
                iconDescription="Save code"
                tooltipPosition="left"
                hasIconOnly
                size="md"
                onClick={handleSave}
              />
            </div>
          </div>
        </div>
      ) : (
        <>
            {openAIApiKey &&
              <div className="relative">
                <div className="text-right">
                  <div className="inline-block p-2">
                    <Bot size={24} className="align-middle" />
                    <span className="text-md align-middle">{agentName}</span>
                  </div>
                  <textarea
                    className="w-full p-2 block-editor-prompt-input resize-none"
                    ref={chatTextarea}
                    placeholder="Ask to generate code or modify last code"
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        handleSubmit(e);
                      }
                    }}
                  />
                </div>

                <div className="absolute bottom-2 right-1">
                  {isLoading ? (
                    <div className='prompt-spinner'>
                      <Loading active={true} description="Sending..." withOverlay={false} />
                    </div>
                  ) : (
                    <IconButton iconDescription="Send Prompt" label="Send Prompt" kind='ghost' onClick={handleSubmit}>
                        <SendFilled size={24} />
                    </IconButton>
                  )}
                </div>
            </div>
            }
        </>
      )}
    </div>
  );
}
