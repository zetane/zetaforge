import { useState } from "react";
import { EditorCodeMirror } from "./CodeMirrorComponents";
import { Button } from "@carbon/react";
import { Save } from "@carbon/icons-react";

export const ManualEditor = ({
  editorRef,
  updatedCode,
  handleSave,
  editorManualPrompt,
}) => {
  const [code, setCode] = useState(updatedCode);

  const wrapHandleSave = (code) => {
    handleSave(code);
  };

  return (
    <div>
      <div ref={editorRef}>{editorManualPrompt}</div>
      <div className="relative">
        <EditorCodeMirror code={code} onChange={setCode} />
        <div className="absolute right-4 top-4">
          <Button
            renderIcon={Save}
            iconDescription="Save code"
            tooltipPosition="left"
            hasIconOnly
            size="md"
            onClick={() => wrapHandleSave(code)}
          />
        </div>
      </div>
    </div>
  );
};
