import { openAIApiKeyAtom } from "@/atoms/apiKeysAtom";
import { compilationErrorToastAtom } from "@/atoms/compilationErrorToast";
import { drawflowEditorAtom } from "@/atoms/drawflowAtom";
import { blockEditorRootAtom } from "@/atoms/editorAtom";
import { pipelineAtom } from "@/atoms/pipelineAtom";
import { updateSpecs } from "@/utils/specs";
import { trpc } from "@/utils/trpc";
import { Bot, Edit, Save, SendFilled } from "@carbon/icons-react";
import { Button, IconButton, Loading, RadioButton } from "@carbon/react";
import { useAtom } from "jotai";
import { useImmerAtom } from "jotai-immer";
import { useEffect, useMemo, useRef, useState } from "react";
import ViewerFragment from "./ViewerFragment";
import { ManualEditor } from "./ManualEditor";

export default function ComputationsFileEditor({ fetchFileSystem }) {
  const serverAddress = "http://localhost:3330";
  const [blockPath] = useAtom(blockEditorRootAtom);
  const relPath = blockPath.replaceAll("\\", "/");
  const blockFolderName = relPath.split("/").pop();
  const [openAIApiKey] = useAtom(openAIApiKeyAtom);
  const [pipeline, setPipeline] = useImmerAtom(pipelineAtom);
  const [editor] = useAtom(drawflowEditorAtom);
  const [, setCompilationErrorToast] = useAtom(compilationErrorToastAtom);

  const [agentName, setAgent] = useState("gpt-4_python_compute");

  const [showEditor, setShowEditor] = useState(false);
  const [editorValue, setEditorValue] = useState("");
  const [editorManualPrompt, setEditorManualPrompt] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const chatTextarea = useRef(null);
  const panel = useRef(null);
  const editorRef = useRef(null);

  const utils = trpc.useUtils();
  const compileComputation = trpc.compileComputation.useMutation();
  const saveBlockSpecs = trpc.saveBlockSpecs.useMutation();
  const history = trpc.chat.history.get.useQuery({ blockPath });
  const historyData = history?.data ?? [];
  const updateHistory = trpc.chat.history.update.useMutation({
    onSuccess(input) {
      utils.chat.history.get.invalidate({ blockPath });
    },
  });

  const index = trpc.chat.index.get.useQuery({ blockPath });
  const indexData = index?.data ?? [];
  const updateIndex = trpc.chat.index.update.useMutation({
    onSuccess(input) {
      utils.chat.index.get.invalidate({ blockPath });
    },
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
        },
      ],
    });
  };

  const handleSubmit = async (e) => {
    setIsLoading(true);
    e.preventDefault();
    const newPrompt = chatTextarea.current.value.trim();

    const toSend = {
      userMessage: newPrompt,
      agentName: agentName,
      conversationHistory: history.data,
      apiKey: openAIApiKey,
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

  useEffect(() => {
    if (editorRef.current) {
      setTimeout(() => {
        editorRef.current.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      }, 200);
    }
  }, [showEditor]);

  const handleSave = (value) => {
    if (editorManualPrompt) {
      recordCode(editorManualPrompt, value);
    }
    setShowEditor(false);
  };

  const handleEdit = (index) => {
    if (index >= 0 && index < history.data.length) {
      setEditorValue(history.data[index].response);
      setEditorManualPrompt("Manual edit of code #" + index);
      setShowEditor(true);
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
      chatHistoryIndex: index,
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
      const newSpecsIO = await compileComputation.mutateAsync({
        blockPath: blockPath,
      });
      const newSpecs = await updateSpecs(
        blockFolderName,
        newSpecsIO,
        pipeline.data,
        editor,
      );
      setPipeline((draft) => {
        draft.data[blockFolderName] = newSpecs;
      });
      await saveBlockSpecs.mutateAsync({
        blockPath: blockPath,
        blockSpecs: newSpecs,
      });
    } catch (error) {
      console.error(error);
      setCompilationErrorToast(true);
    }

    updateIndex.mutateAsync({
      blockPath: blockPath,
      index: index,
    });

    fetchFileSystem();
  };

  const fragments = useMemo(() => {
    let fragmentArray = [];
    fragmentArray = historyData.map((item, i) => {
      const code = item?.response ?? "";
      const prompt = item?.prompt ?? "";
      return (
        <ViewerFragment
          key={i}
          currentIndex={i}
          code={code}
          prompt={prompt}
          selectedIndex={indexData}
          handleGenerate={handleGenerate}
          handleEdit={handleEdit}
        />
      );
    });
    return fragmentArray;
  }, [historyData, indexData]);

  let editorComponent = null;
  if (showEditor) {
    editorComponent = (
      <ManualEditor
        updatedCode={editorValue}
        handleSave={handleSave}
        editorManualPrompt={editorManualPrompt}
        editorRef={editorRef}
      />
    );
  } else {
    editorComponent = (
      <div ref={editorRef}>
        {openAIApiKey && (
          <div className="relative">
            <div className="text-right">
              <div className="inline-block p-2">
                <Bot size={24} className="align-middle" />
                <span className="text-md align-middle">{agentName}</span>
              </div>
              <textarea
                className="block-editor-prompt-input w-full resize-none p-2"
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
                <div className="prompt-spinner">
                  <Loading
                    active={true}
                    description="Sending..."
                    withOverlay={false}
                  />
                </div>
              ) : (
                <IconButton
                  iconDescription="Send Prompt"
                  label="Send Prompt"
                  kind="ghost"
                  onClick={handleSubmit}
                >
                  <SendFilled size={24} />
                </IconButton>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-y-12">
      {fragments}
      {editorComponent}
    </div>
  );
}
