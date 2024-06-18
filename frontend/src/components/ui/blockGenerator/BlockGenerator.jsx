import { drawflowEditorAtom } from "@/atoms/drawflowAtom";
import { pipelineAtom } from "@/atoms/pipelineAtom";
import { Code, View } from "@carbon/icons-react";
import { useImmerAtom } from "jotai-immer";
import { useEffect, useRef, useState } from "react";
import { FileBlock } from "./FileBlock";
import { activeConfigurationAtom } from "@/atoms/anvilConfigurationsAtom";
import { modalContentAtom } from "@/atoms/modalAtom";
import { useAtom } from "jotai";
import ClosableModal from "@/components/ui/modal/ClosableModal";
import { trimQuotes } from "@/utils/blockUtils";

const isTypeDisabled = (action) => {
  if (!action.parameters) {
    return false
  }
  return true
}

const checkPath = async (path, count, setIframeSrc) => {
  fetch(path)
    .then(response => {
      if (response.status === 404) {
        console.log('Path not found. Retrying in 1 second...');
        if (count < 15) {
          setTimeout(() => {
            checkPath(path, count + 1, setIframeSrc);
          }, 1000);
        }
      } else {
        setIframeSrc(path)
      }
    })
    .catch(error => {
      console.log('Error:', error);
    });
}

const BlockGenerator = ({ block, openView, id, history }) => {
  const [pipeline, setFocusAction] = useImmerAtom(pipelineAtom)
  const [editor, _s] = useAtom(drawflowEditorAtom);
  const [configuration] = useAtom(activeConfigurationAtom)

  const styles = {
    top: `${block.views.node.pos_y}px`,
    left: `${block.views.node.pos_x}px`
  }

  const [iframeSrc, setIframeSrc] = useState("")
  useEffect(() => {
    if (block.events.outputs?.html) {
      // these outputs are a special case
      const html = trimQuotes(block.events.outputs.html)
      const fileUrl = `http://${configuration.host}:${configuration.s3Port}/zetaforge/${history}/${html}`
      checkPath(fileUrl, 0, setIframeSrc)
    }
  }, [block.events.outputs?.html])

  const disabled = isTypeDisabled(block.action)
  const preview = (block.views.node.preview?.active == "true")

  const handleInputChange = (name, value, parameterName) => {
    setFocusAction((draft) => {
      draft.data[id].action.parameters[parameterName].value = value
    })
  }

  let content = (<BlockContent
    html={block.views.node.html}
    block={block}
    onInputChange={handleInputChange}
    id={id}
    history={history}
    />)
  const type = block?.action?.parameters?.path?.type
  if (type == "file" || type == "blob" || type == "fileLoad") {
    content = (<FileBlock blockId={id} block={block} setFocusAction={setFocusAction} history={history}/>)
  }

  const backgroundColor = block.views?.node?.title_bar?.background_color || 'var(--title-background-color)';

  return (
    <div className="parent-node">
      <div className="drawflow-node" id={`node-${id}`} style={styles}>
        <div className="drawflow_content_node">
          {preview && <BlockPreview id={id} src={iframeSrc} history={history}/>}

          <BlockTitle
            name={block.information.name}
            id={id}
            color={backgroundColor}
            openView={openView}
            actions={!disabled}
            src={iframeSrc}
            blockEvents={block.events}
            history={history}
          />
          <div className="block-body">
            <div className="block-io">
              <BlockInputs inputs={block.inputs} history={history} block={block}/>
              <BlockOutputs outputs={block.outputs} history={history} block={block}/>
            </div>
            {content}
          </div>
        </div>
      </div>
    </div>
  );
};

const BlockPreview = ({ id, src }) => {
  return (
    <div className="block-preview">
      <div>
        <iframe className="iframe-preview" id={id} src={src}>
        </iframe>
      </div>
    </div>
  )
}


const BlockTitle = ({ name, id, color, openView, actions, src, blockEvents, history }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [modalContent, setModalContent] = useAtom(modalContentAtom);

  const eventsModal = (
    <ClosableModal
      modalHeading="Block Events"
    >
      <div className="flex flex-col gap-4 p-3">
        {JSON.stringify(blockEvents, null, 2)}
      </div>
    </ClosableModal>
  )

  const handleViewClick = () => {
    if (!src) {
      modalPopper(eventsModal)
    } else {
      window.open(src, '_blank');
    }
  };

  let actionContainer = (
    <div className="action-container">
      <button id="btn_open_code" className="view-btn" onClick={() => openView(id)}><Code size={20}/></button>
      <button id="btn_show_view" className="view-btn" onClick={handleViewClick}><View size={20}/></button>
    </div>
  );

  const modalPopper = (content) => {
    setModalContent({
      ...modalContent,
      show: true,
      content: content,
    });
  };

  return (
    <div className="title-box" style={{ backgroundColor: color }}>
      <span>{name}</span>
      {actions && actionContainer}
    </div>
  );
};

const parseHtmlToInputs = (html) => {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const inputElements = doc.querySelectorAll('input, textarea');

  const inputs = Array.from(inputElements).map((element) => {
    const parameterAttr = Array.from(element.attributes).find((attr) =>
      attr.name.startsWith('parameters-')
    );
    const parameterName = parameterAttr ? parameterAttr.name.split('-')[1] : '';

    return {
      type: element.tagName.toLowerCase(),
      value: element.value,
      name: element.name,
      step: element.step,
      parameterName: parameterName,
    };
  });

  return inputs;
};

const InputField = ({ type, value, name, step, parameterName, onChange, id }) => {
  const [editor, _] = useAtom(drawflowEditorAtom);
  const [currentValue, setCurrentValue] = useState(value);
  const inputRef = useRef(null);
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);

  useEffect(() => {
    setCurrentValue(value)
  }, [value])

  useEffect(() => {
    if (!editor) return;
    if (!inputRef && !inputRef.current) return;

    const resizeObserver = new ResizeObserver(entry => {
      if (entry[0].target.classList.contains('textarea-node')) {
        editor.updateConnectionNodes(`node-${id}`);
      }
    });

    if (inputRef?.current) {
      resizeObserver.observe(inputRef.current)
    }

    return () => resizeObserver.disconnect();
  }, [])

  const setCursorPosition = (start, end) => {
    if (!inputRef?.current) return;
    inputRef.current.selectionStart = start;
    inputRef.current.selectionEnd = end || start;
  };

  const preventQuotation = (event) => {
    const quotations = ['"', "'", '`'];
    const { key } = event;

    const { selectionStart, selectionEnd } = inputRef?.current;
    const atBeginning = selectionStart === 0; // beginning of text, left of start quote
    const atEnd = selectionEnd - 2 === currentValue.length; // end of text, right of end quote
    const isRangedSelection = selectionStart !== selectionEnd; // substring is highlighted
    const boundaries =
      quotations.includes(key) ||
      key === "Backspace" && (atBeginning || selectionStart === 1) && !isRangedSelection ||
      key === "Delete" && (atEnd || selectionEnd - 1 === currentValue.length) && !isRangedSelection ||
      key === 'ArrowLeft' && atEnd ||
      key === 'ArrowRight' && atBeginning;

    if (boundaries) event.preventDefault();

    if (isRangedSelection) {
      if (atBeginning && atEnd) {
        setCursorPosition(1, selectionEnd - 1);
      } else if (atBeginning) {
        setCursorPosition(1, selectionEnd);
      } else if (atEnd) {
        setCursorPosition(selectionStart, selectionEnd - 1);
      }
    } else {
      if (atEnd) {
        setCursorPosition(selectionEnd - 1);
      } else if (atBeginning) {
        setCursorPosition(1);
      }
    }
  }

  const EyeOpenIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="gray" class="bi bi-eye-fill" viewBox="0 0 16 16">
      <path d="M10.5 8a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0" />
      <path d="M0 8s3-5.5 8-5.5S16 8 16 8s-3 5.5-8 5.5S0 8 0 8m8 3.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7" />
    </svg>
  );

  const EyeClosedIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="gray" class="bi bi-eye-slash-fill" viewBox="0 0 16 16">
      <path d="m10.79 12.912-1.614-1.615a3.5 3.5 0 0 1-4.474-4.474l-2.06-2.06C.938 6.278 0 8 0 8s3 5.5 8 5.5a7 7 0 0 0 2.79-.588M5.21 3.088A7 7 0 0 1 8 2.5c5 0 8 5.5 8 5.5s-.939 1.721-2.641 3.238l-2.062-2.062a3.5 3.5 0 0 0-4.474-4.474z" />
      <path d="M5.525 7.646a2.5 2.5 0 0 0 2.829 2.829zm4.95.708-2.829-2.83a2.5 2.5 0 0 1 2.829 2.829zm3.171 6-12-12 .708-.708 12 12z" />
    </svg>
  );

  const isTextBlock = name === 'text';

  const handleChange = (event) => {
    const displayedValue = !isTextBlock ? event.target.value : event.target.value.replace(/['"]/g, '');
    setCurrentValue(displayedValue);
    const blockValue = !isTextBlock ? event.target.value : JSON.stringify(displayedValue);
    onChange(name, blockValue, parameterName);
  };

  switch (name) {
    case 'text':
      return (
        <textarea
          value={value !== "" ? `"${currentValue}"` : currentValue}
          name={name}
          onChange={handleChange}
          {...(parameterName && { [`parameters-${parameterName}`]: '' })}
          className="input-element textarea-node"
          onKeyDown={preventQuotation}
          ref={inputRef}
          style={{
            resize: "both",
            overflow: "auto",
            height: "100px",
            minHeight: "100px",
            width: "250px",
            minWidth: "250px"
          }}
        />
      );

    case 'password':
      return (
        <div style={{ position: 'relative' }}>
          <input
            type={isPasswordVisible ? 'text' : 'password'}
            value={currentValue}
            name={name}
            onChange={handleChange}
            className="input-element"
            ref={inputRef}
            style={{
              minWidth: '200px',
              padding: '10px',
              paddingRight: '28px'
            }}
          />
          <button
            onClick={() => setIsPasswordVisible(!isPasswordVisible)}
            style={{
              position: 'absolute',
              right: '16px',
              top: '25%',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer'
            }}
          >
            {isPasswordVisible ? <EyeOpenIcon /> : <EyeClosedIcon />}
          </button>
        </div>
      );

    default:
      return (
        <textarea
          value={currentValue}
          name={name}
          onChange={handleChange}
          {...(parameterName && { [`parameters-${parameterName}`]: '' })}
          className="input-element textarea-node"
          rows="1"
          ref={inputRef}
          style={{
            resize: "both",
            overflow: "auto",
            height: "30px",
            minHeight: "30px",
            width: "250px",
            minWidth: "250px"
          }}
        />
      );
  }
};

const BlockContent = ({ html, block, onInputChange, id, history }) => {
  const parsedInputs = parseHtmlToInputs(html);

  return (
    <div className="block-content">
      {parsedInputs.map((input, index) => {
        const parameterName = input.parameterName;
        const value = block.action?.parameters[parameterName]?.value || '';
        return (
          <InputField
            key={index}
            type={input.type}
            value={value}
            name={parameterName}
            step={input.step}
            parameterName={input.parameterName}
            onChange={(name, value, parameterName) =>
              onInputChange(name, value, parameterName)
            }
            id={id}
          />
        )
      })}
    </div>
  );
};

const BlockInputs = ({ inputs, history }) => (
  <div className="inputs">
    {Object.entries(inputs).map(([name, input]) => (
      <div key={name} className="block-input">
        <div className={`input ${name}`}></div>
        <span className="type-icon">
          <i className={getIcon(input.type)}></i>
        </span>
        <span className="input-name">{name}</span>
      </div>
    ))}
  </div>
);

const BlockOutputs = ({ outputs, history }) => (
  <div className="outputs">
    {Object.entries(outputs).map(([name, output]) => (
      <div key={name} className="block-output">
        <span className="output-name">{name}</span>
        <span className="type-icon">
          <i className={getIcon(output.type)}></i>
        </span>
        <div className={`output ${name}`}></div>
      </div>
    ))}
  </div>
);

const getIcon = (type) => {
  if (type == 'filepath') {
    return 'fas fa-regular fa-file'
  }
  else if (type == 'image') {
    return 'fas fa-thin fa-images'
  }
  else if (type == 'text') {
    return 'fa fa-font'
  }
  else if (type == 'str') {
    return 'fa fa-font'
  }
  else if (type == 'int') {
    return 'fa fa-hashtag'
  }
  else if (type == 'float') {
    return 'fa fa-hashtag'
  }
  else if (type == 'List[int]') {
    return 'fa fa-hashtag'
  }
  else if (type == 'view') {
    return 'fa fa-eye'
  }
  else if (type == 'controller') {
    return 'fa fa-gamepad'
  }
  else {
    return 'fa fa-star'
  }
}

export default BlockGenerator;
