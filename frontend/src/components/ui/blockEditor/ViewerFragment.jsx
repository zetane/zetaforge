import { Fragment } from "react";
import { RadioButton, Button } from "@carbon/react";
import { ViewerCodeMirror } from "./CodeMirrorComponents";
import { Edit } from "@carbon/icons-react";

export default function ViewerFragment({
  code,
  prompt,
  currentIndex,
  selectedIndex,
  handleGenerate,
  handleEdit,
}) {
  const selected = currentIndex == selectedIndex;
  return (
    <Fragment key={currentIndex}>
      <span className="block-editor-prompt">{prompt}</span>
      <div>
        <div className="mb-4 flex items-center">
          <RadioButton
            checked={selected}
            onChange={() => handleGenerate(currentIndex)}
            labelText={`Select Code #${currentIndex}`}
          />
        </div>
        <div
          className="relative"
          style={{
            border: selected ? "2px solid darkorange" : "none",
          }}
        >
          <ViewerCodeMirror
            key={currentIndex + "-viewer"}
            currentIndex={currentIndex}
            code={code}
          />
          <div className="absolute right-4 top-4">
            <Button
              renderIcon={Edit}
              iconDescription="Edit Code"
              tooltipPosition="top"
              hasIconOnly
              size="md"
              onClick={() => handleEdit(currentIndex)}
            />
          </div>
        </div>
      </div>
    </Fragment>
  );
}
